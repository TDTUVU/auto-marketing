import path from 'path'
import { readFile } from 'fs/promises'
import { connectDB } from '../db/index'
import { Account, Post, AutoPilotConfig, AutomationLog } from '../db/schema'
import { createPostWorker, scheduleCommentPoll, type PostJobData } from './jobs'
import { postToFacebook, tokensFromSession, fetchFbTokens } from '@automation/core'
import type { PhotoInput } from '@automation/core'
import { loadSessionForAccount } from '../session'

async function handlePostJob(data: PostJobData): Promise<void> {
  const { postId, accountId, content, imagePaths } = data

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
    tokens = tokensFromSession(session.userId, session.tokens)
  } else {
    tokens = await fetchFbTokens(session.cookies, session.userAgent)
  }

  // Đọc file ảnh từ disk → Buffer
  const photos: PhotoInput[] = []
  if (imagePaths?.length) {
    console.log(`[PostWorker] loading ${imagePaths.length} image(s) from disk...`)
    for (const filePath of imagePaths) {
      try {
        const buffer = await readFile(filePath)
        const ext = path.extname(filePath).slice(1).toLowerCase()
        const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }
        photos.push({ buffer, filename: path.basename(filePath), mimeType: mimeMap[ext] ?? 'image/jpeg' })
        console.log(`[PostWorker] loaded: ${filePath} (${buffer.length} bytes)`)
      } catch (err) {
        console.error(`[PostWorker] FAILED to read image ${filePath}:`, err)
      }
    }
    console.log(`[PostWorker] ${photos.length}/${imagePaths.length} images loaded`)
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
      ...(result.postId ? { platformPostId: result.postId } : {}),
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
