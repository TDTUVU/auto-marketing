import { connectDB } from '../db/index'
import { Account, Post, AutoPilotConfig, AutomationLog } from '../db/schema'
import { createPostWorker, scheduleCommentPoll, type PostJobData } from './jobs'
import { postToFacebook, tokensFromSession, fetchFbTokens } from '@automation/core'
import type { PhotoInput } from '@automation/core'
import { loadSessionForAccount, updateSessionTokens } from '../session'

async function handlePostJob(data: PostJobData): Promise<void> {
  const { postId, accountId, content, images } = data

  await connectDB()

  console.log('[PostWorker] processing job — accountId:', accountId, 'length:', accountId.length)

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

  let tokens
  if (session.tokens?.fb_dtsg) {
    console.log('[PostWorker] Using cached tokens')
    tokens = tokensFromSession(session.userId, session.tokens)
  } else {
    console.log('[PostWorker] Fetching new tokens from Facebook...')
    tokens = await fetchFbTokens(session.cookies, session.userAgent)
    await updateSessionTokens(accountId, {
      fb_dtsg: tokens.fbDtsg,
      lsd: tokens.lsd,
      rev: tokens.rev,
      hsi: '',
    })
    console.log('[PostWorker] Tokens cached to MongoDB')
  }

  const photos: PhotoInput[] = []
  if (images?.length) {
    console.log(`[PostWorker] loading ${images.length} image(s) from job data...`)
    for (const img of images) {
      const buffer = Buffer.from(img.base64, 'base64')
      photos.push({ buffer, filename: img.filename, mimeType: img.mimeType })
      console.log(`[PostWorker] loaded: ${img.filename} (${buffer.length} bytes)`)
    }
  } else {
    console.log('[PostWorker] no images for this post')
  }

  const result = await postToFacebook(session.cookies, session.userAgent, tokens, {
    text: content,
    photos,
    pageId: account.pageId,
  })

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
    action: 'post_to_facebook',
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
      console.log(`[PostWorker] Auto-reply scheduled for post ${postId}`)
    }
  }

  if (!result.success) {
    throw new Error(result.error ?? 'Post failed')
  }
}

export const worker = createPostWorker(handlePostJob)
