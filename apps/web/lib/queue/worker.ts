import { connectDB } from '../db/index'
import { Account, Post, AutoPilotConfig, AutomationLog } from '../db/schema'
import { createPostWorker, scheduleCommentPoll, type PostJobData } from './jobs'
import { postToFacebook, tokensFromSession, fetchFbTokens } from '@automation/core'
import { postToTwitterViaDOM } from '@automation/core'
import type { PhotoInput, AutomationResult, SessionData } from '@automation/core'
import { loadSessionForAccount, updateSessionTokens } from '../session'

// Hạn tối đa cho 1 lần đăng. Lệnh gọi mạng (FB token/upload, Playwright X) nếu treo
// lúc mạng chập chờn sẽ chiếm slot concurrency:1 vĩnh viễn (job vẫn await → lock vẫn
// được gia hạn → BullMQ KHÔNG coi là stalled). Timeout ép job fail để giải phóng hàng đợi.
const POST_TIMEOUT_MS = Number(process.env['POST_JOB_TIMEOUT_MS'] ?? 3 * 60 * 1000)

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} quá hạn sau ${ms}ms`)), ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) }
    )
  })
}

async function handleFacebookPost(
  accountId: string,
  content: string,
  photos: PhotoInput[],
  session: SessionData,
  pageId?: string
): Promise<AutomationResult> {
  let tokens
  if (session.tokens?.fb_dtsg) {
    console.log('[PostWorker:fb] Using cached tokens')
    tokens = tokensFromSession(session.userId, session.tokens)
  } else {
    console.log('[PostWorker:fb] Fetching new tokens from Facebook...')
    tokens = await fetchFbTokens(session.cookies, session.userAgent)
    await updateSessionTokens(accountId, {
      fb_dtsg: tokens.fbDtsg,
      lsd: tokens.lsd,
      rev: tokens.rev,
      hsi: '',
    })
  }

  let result = await postToFacebook(session.cookies, session.userAgent, tokens, {
    text: content,
    photos,
    pageId,
  })

  if (!result.success && result.error?.includes('1357032') && session.tokens?.fb_dtsg) {
    console.log('[PostWorker:fb] Cached tokens failed, fetching fresh tokens...')
    tokens = await fetchFbTokens(session.cookies, session.userAgent)
    await updateSessionTokens(accountId, {
      fb_dtsg: tokens.fbDtsg,
      lsd: tokens.lsd,
      rev: tokens.rev,
      hsi: '',
    })
    result = await postToFacebook(session.cookies, session.userAgent, tokens, {
      text: content,
      photos,
      pageId,
    })
  }

  return result
}

async function handleTwitterPost(
  content: string,
  photos: PhotoInput[],
  session: SessionData
): Promise<AutomationResult> {
  // DOM automation: để client web của X tự sinh x-client-transaction-id,
  // tránh lỗi "this request looks like it might be automated" của HTTP replay.
  return postToTwitterViaDOM(session.cookies, session.userAgent, {
    text: content,
    photos,
  })
}

async function handlePostJob(data: PostJobData): Promise<void> {
  const { postId, accountId, content, images } = data

  await connectDB()

  console.log('[PostWorker] processing job — accountId:', accountId)

  const account = await Account.findById(accountId)
  if (!account) {
    await Post.findByIdAndUpdate(postId, {
      status: 'failed',
      errorMessage: `Account not found: ${accountId}`,
    })
    throw new Error(`Account not found: ${accountId}`)
  }

  const session = await loadSessionForAccount(accountId)
  if (!session) {
    await Post.findByIdAndUpdate(postId, {
      status: 'failed',
      errorMessage: `Session not found for account: ${accountId}`,
    })
    throw new Error(`Session not found for account: ${accountId}`)
  }

  const photos: PhotoInput[] = []
  if (images?.length) {
    console.log(`[PostWorker] loading ${images.length} image(s) from job data...`)
    for (const img of images) {
      const buffer = Buffer.from(img.base64, 'base64')
      photos.push({ buffer, filename: img.filename, mimeType: img.mimeType })
    }
  }

  let result: AutomationResult
  switch (account.platform) {
    case 'facebook':
      result = await withTimeout(
        handleFacebookPost(accountId, content, photos, session, account.pageId),
        POST_TIMEOUT_MS,
        'Facebook post'
      )
      break
    case 'twitter':
      result = await withTimeout(
        handleTwitterPost(content, photos, session),
        POST_TIMEOUT_MS,
        'Twitter post'
      )
      break
    default:
      result = { success: false, error: `Platform "${account.platform}" chưa hỗ trợ`, timestamp: new Date() }
  }

  if (result.success) {
    await Post.findByIdAndUpdate(postId, {
      status: 'published',
      publishedAt: result.timestamp,
      platformPostId: result.postUrl || result.postId || '',
    })
  } else {
    await Post.findByIdAndUpdate(postId, {
      status: 'failed',
      errorMessage: result.error,
    })
  }

  await AutomationLog.create({
    postId,
    action: `post_to_${account.platform}`,
    success: result.success,
    detail: result.success ? 'Posted successfully' : result.error,
    timestamp: result.timestamp,
  })

  if (result.success && result.postUrl) {
    const config = await AutoPilotConfig.findOne({ accountId }).lean()
    if (config?.autoReplyEnabled) {
      await scheduleCommentPoll({
        postId,
        accountId,
        postUrl: result.postUrl,
        postContent: content,
      })
      await Post.findByIdAndUpdate(postId, { autoReplyEnabled: true })
      console.log(`[PostWorker] Auto-reply scheduled for post ${postId}`)
    }
  }

  if (!result.success) {
    throw new Error(result.error ?? 'Post failed')
  }
}

export const worker = createPostWorker(handlePostJob)
