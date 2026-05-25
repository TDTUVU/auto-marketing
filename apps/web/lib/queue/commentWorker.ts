import { connectDB } from '../db/index'
import { Account, Post, Comment, Product, AutoPilotConfig, AutomationLog } from '../db/schema'
import { createCommentWorker, type CommentJobData } from './jobs'
import { tokensFromSession, fetchFbTokens, createComment } from '@automation/core'
import { fetchPostComments } from '@automation/core'
import { generateCommentReply, type ProductInfo } from '../llm/content'
import { loadSessionForAccount } from '../session'

async function handleCommentJob(data: CommentJobData): Promise<void> {
  const { postId, accountId, postUrl, postContent } = data

  await connectDB()

  const account = await Account.findById(accountId)
  if (!account) throw new Error(`Account not found: ${accountId}`)

  const config = await AutoPilotConfig.findOne({ accountId }).lean()
  const replyTone = config?.replyTone ?? 'friendly'
  const skipSpam = config?.skipSpam ?? true

  const products = await Product.find({ accountId, isActive: true })
    .select('name description price category')
    .lean()

  const productInfos: ProductInfo[] = products.map((p) => ({
    name: p.name,
    description: p.description,
    price: p.price,
    category: p.category,
  }))

  const session = await loadSessionForAccount(accountId)
  if (!session) throw new Error(`Session not found for account: ${accountId}`)

  let tokens
  if (session.tokens?.fb_dtsg) {
    tokens = tokensFromSession(session.userId, session.tokens)
  } else {
    tokens = await fetchFbTokens(session.cookies, session.userAgent)
  }

  const comments = await fetchPostComments(session, postUrl)

  const existingReplied = new Set(
    (await Comment.find({ postId, repliedAt: { $exists: true } }).select('facebookCommentId').lean())
      .map((c) => c.facebookCommentId)
  )

  let repliedCount = 0
  let skippedCount = 0

  for (const comment of comments) {
    if (existingReplied.has(comment.feedbackId)) continue

    await Comment.findOneAndUpdate(
      { facebookCommentId: comment.feedbackId },
      {
        $setOnInsert: {
          postId,
          facebookCommentId: comment.feedbackId,
          authorId: comment.authorId,
          authorName: comment.authorName,
          text: comment.text,
        },
      },
      { upsert: true, new: true }
    )

    const replyResult = await generateCommentReply({
      shopName: account.name,
      postContent,
      commentText: comment.text,
      tone: replyTone,
      products: productInfos,
      skipSpam,
    })

    if (replyResult.skip || !replyResult.reply) {
      skippedCount++
      await AutomationLog.create({
        postId,
        action: 'reply_skipped',
        success: true,
        detail: `Skipped ${comment.authorName} [${replyResult.intent}]: "${comment.text.slice(0, 60)}"`,
        timestamp: new Date(),
      })
      continue
    }

    const result = await createComment(
      session.cookies,
      session.userAgent,
      tokens,
      comment.feedbackId,
      replyResult.reply
    )

    if (result.success) {
      await Comment.findOneAndUpdate(
        { facebookCommentId: comment.feedbackId },
        { repliedAt: new Date(), replyText: replyResult.reply }
      )
      repliedCount++
    }

    await AutomationLog.create({
      postId,
      action: 'reply_comment',
      success: result.success,
      detail: result.success
        ? `[${replyResult.intent}] → ${comment.authorName}: "${replyResult.reply.slice(0, 60)}"`
        : result.error,
      timestamp: new Date(),
    })

    await new Promise((r) => setTimeout(r, 5000 + Math.random() * 5000))
  }

  if (repliedCount > 0 || skippedCount > 0) {
    console.log(`[CommentWorker] post ${postId}: replied=${repliedCount} skipped=${skippedCount}`)
  }

  if (repliedCount > 0) {
    await Post.findByIdAndUpdate(postId, { $inc: { repliedComments: repliedCount } as never })
  }
}

export const commentWorker = createCommentWorker(handleCommentJob)
