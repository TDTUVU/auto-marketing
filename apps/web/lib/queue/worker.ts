import { connectDB } from '../db/index'
import { Account, Post, AutoPilotConfig, AutomationLog } from '../db/schema'
import { createPostWorker, scheduleCommentPoll, type PostJobData } from './jobs'
import { postToFacebookViaDOM, postToTwitterViaDOM } from '@automation/core'
import type { PhotoInput, AutomationResult, SessionData } from '@automation/core'
import { loadSessionForAccount, saveSessionCookies } from '../session'

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
  content: string,
  photos: PhotoInput[],
  session: SessionData,
  accountId: string
): Promise<AutomationResult> {
  // DOM automation bằng browser thật thay cho HTTP replay: tận dụng cookie i_user để
  // đăng dưới danh nghĩa Page, giữ phiên trong browser thật → bền hơn, tránh FB hủy
  // phiên do nghi automation (lỗi 1357001 "Chưa đăng nhập").
  // onCookies: lưu lại cookie FB vừa xoay vòng → phiên sống lâu hơn, đỡ phải re-export.
  return postToFacebookViaDOM(session.cookies, session.userAgent, {
    text: content,
    photos,
  }, {
    onCookies: (cookies) => saveSessionCookies(accountId, cookies),
  })
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
        handleFacebookPost(content, photos, session, accountId),
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
      // Xoá lỗi của lần thử trước (vd lần 1 false-fail rồi retry thành công) — nếu không
      // record vẫn dính errorMessage cũ và dashboard hiện đỏ dù bài đã lên.
      errorMessage: '',
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
