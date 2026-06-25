import { connectDB } from '../db/index'
import { Account, Post, Comment, Product, AutoPilotConfig, AutomationLog } from '../db/schema'
import { createCommentWorker, type CommentJobData } from './jobs'
import { tokensFromSession, fetchFbTokens, createComment } from '@automation/core'
import { fetchPostComments } from '@automation/core'
import { replyToTweetViaDOM, fetchTweetRepliesViaDOM, extractTwitterUserId } from '@automation/core'
import type { FbTokens, SessionData } from '@automation/core'
import { generateCommentReply, type ProductInfo } from '../llm/content'
import { loadSessionForAccount } from '../session'

interface NormalizedComment {
  id: string
  authorId: string
  authorName: string
  text: string
}

async function handleFacebookComments(
  data: CommentJobData,
  account: InstanceType<typeof Account>,
  session: SessionData,
  productInfos: ProductInfo[],
  replyTone: string,
  skipSpam: boolean
): Promise<{ replied: number; skipped: number }> {
  let tokens: FbTokens
  if (session.tokens?.fb_dtsg) {
    tokens = tokensFromSession(session.userId, session.tokens)
  } else {
    tokens = await fetchFbTokens(session.cookies, session.userAgent)
  }

  const refreshTokens = async () => {
    console.log('[CommentWorker:fb] Refreshing tokens...')
    tokens = await fetchFbTokens(session.cookies, session.userAgent)
  }

  const comments = await fetchPostComments(session, data.postUrl)

  const normalized: NormalizedComment[] = comments.map((c) => ({
    id: c.feedbackId,
    authorId: c.authorId,
    authorName: c.authorName,
    text: c.text,
  }))

  return processReplies(
    normalized,
    data,
    account,
    productInfos,
    replyTone,
    skipSpam,
    async (commentId, replyText) => {
      let result = await createComment(session.cookies, session.userAgent, tokens, commentId, replyText)
      if (!result.success && result.error?.includes('1357032')) {
        await refreshTokens()
        result = await createComment(session.cookies, session.userAgent, tokens, commentId, replyText)
      }
      return result.success
    }
  )
}

async function handleTwitterComments(
  data: CommentJobData,
  account: InstanceType<typeof Account>,
  session: SessionData,
  productInfos: ProductInfo[],
  replyTone: string,
  skipSpam: boolean
): Promise<{ replied: number; skipped: number }> {
  const ownerId = extractTwitterUserId(session.cookies)
  const replies = await fetchTweetRepliesViaDOM(session.cookies, session.userAgent, data.postUrl, ownerId)

  const normalized: NormalizedComment[] = replies.map((r) => ({
    id: r.tweetId,
    authorId: r.authorId,
    authorName: r.authorName || r.authorHandle,
    text: r.text,
  }))

  return processReplies(
    normalized,
    data,
    account,
    productInfos,
    replyTone,
    skipSpam,
    async (tweetId, replyText) => {
      const result = await replyToTweetViaDOM(session.cookies, session.userAgent, tweetId, replyText)
      return result.success
    }
  )
}

async function processReplies(
  comments: NormalizedComment[],
  data: CommentJobData,
  account: InstanceType<typeof Account>,
  productInfos: ProductInfo[],
  replyTone: string,
  skipSpam: boolean,
  sendReply: (commentId: string, replyText: string) => Promise<boolean>
): Promise<{ replied: number; skipped: number }> {
  const { postId, postContent } = data

  const existingReplied = new Set(
    (await Comment.find({ postId, repliedAt: { $exists: true } }).select('facebookCommentId').lean())
      .map((c) => c.facebookCommentId)
  )

  let replied = 0
  let skipped = 0

  for (const comment of comments) {
    if (existingReplied.has(comment.id)) continue

    await Comment.findOneAndUpdate(
      { facebookCommentId: comment.id },
      {
        $setOnInsert: {
          postId,
          facebookCommentId: comment.id,
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
      tone: replyTone as 'friendly' | 'professional' | 'fun',
      products: productInfos,
      skipSpam,
    })

    if (replyResult.skip || !replyResult.reply) {
      skipped++
      await AutomationLog.create({
        postId,
        action: 'reply_skipped',
        success: true,
        detail: `Skipped ${comment.authorName} [${replyResult.intent}]: "${comment.text.slice(0, 60)}"`,
        timestamp: new Date(),
      })
      continue
    }

    const success = await sendReply(comment.id, replyResult.reply)

    if (success) {
      await Comment.findOneAndUpdate(
        { facebookCommentId: comment.id },
        { repliedAt: new Date(), replyText: replyResult.reply }
      )
      replied++
    }

    await AutomationLog.create({
      postId,
      action: 'reply_comment',
      success,
      detail: success
        ? `[${replyResult.intent}] → ${comment.authorName}: "${replyResult.reply.slice(0, 60)}"`
        : 'Reply failed',
      timestamp: new Date(),
    })

    await new Promise((r) => setTimeout(r, 5000 + Math.random() * 5000))
  }

  return { replied, skipped }
}

async function handleCommentJob(data: CommentJobData): Promise<void> {
  const { postId, accountId } = data

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

  let result: { replied: number; skipped: number }
  switch (account.platform) {
    case 'facebook':
      result = await handleFacebookComments(data, account, session, productInfos, replyTone, skipSpam)
      break
    case 'twitter':
      result = await handleTwitterComments(data, account, session, productInfos, replyTone, skipSpam)
      break
    default:
      throw new Error(`Platform "${account.platform}" chưa hỗ trợ auto-reply`)
  }

  if (result.replied > 0 || result.skipped > 0) {
    console.log(`[CommentWorker:${account.platform}] post ${postId}: replied=${result.replied} skipped=${result.skipped}`)
  }

  if (result.replied > 0) {
    await Post.findByIdAndUpdate(postId, { $inc: { repliedComments: result.replied } as never })
  }
}

export const commentWorker = createCommentWorker(handleCommentJob)
