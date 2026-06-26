import { connectDB } from '../db/index'
import { Account, Post, Comment, Product, AutoPilotConfig, AutomationLog } from '../db/schema'
import { createCommentWorker, type CommentJobData } from './jobs'
import { fetchPostComments, replyToCommentViaDOM } from '@automation/core'
import { replyToTweetViaDOM, fetchTweetRepliesViaDOM, extractTwitterUserId } from '@automation/core'
import type { SessionData } from '@automation/core'
import { generateCommentReply, type ProductInfo } from '../llm/content'
import { loadSessionForAccount, saveSessionCookies } from '../session'

interface NormalizedComment {
  id: string
  authorId: string
  authorName: string
  text: string
}

// Chuẩn hóa để so khớp nội dung (bỏ hoa/thường + gộp khoảng trắng).
function normalizeText(s: string): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

async function handleFacebookComments(
  data: CommentJobData,
  account: InstanceType<typeof Account>,
  session: SessionData,
  productInfos: ProductInfo[],
  replyTone: string,
  skipSpam: boolean
): Promise<{ replied: number; skipped: number }> {
  // onCookies: lưu lại cookie FB vừa xoay vòng sau mỗi lần poll → giữ phiên sống lâu.
  const persist = (cookies: Parameters<typeof saveSessionCookies>[1]) =>
    saveSessionCookies(data.accountId, cookies)
  const comments = await fetchPostComments(session, data.postUrl, { onCookies: persist })

  const normalized: NormalizedComment[] = comments.map((c) => ({
    id: c.feedbackId,
    authorId: c.authorId,
    authorName: c.authorName,
    text: c.text,
  }))

  // Reply bằng DOM (browser thật) thay cho createComment HTTP replay — đồng bộ với
  // việc đăng bài đã chuyển sang DOM, giữ phiên bền hơn. Định vị comment theo text.
  return processReplies(
    normalized,
    data,
    account,
    productInfos,
    replyTone,
    skipSpam,
    async (comment, replyText) => {
      const result = await replyToCommentViaDOM(
        session.cookies,
        session.userAgent,
        data.postUrl,
        comment.text,
        replyText,
        { onCookies: persist }
      )
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
    async (comment, replyText) => {
      const result = await replyToTweetViaDOM(session.cookies, session.userAgent, comment.id, replyText)
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
  sendReply: (comment: NormalizedComment, replyText: string) => Promise<boolean>
): Promise<{ replied: number; skipped: number }> {
  const { postId, postContent } = data

  const repliedDocs = await Comment.find({ postId, repliedAt: { $exists: true } })
    .select('facebookCommentId replyText')
    .lean()
  const existingReplied = new Set(repliedDocs.map((c) => c.facebookCommentId))

  // Reply của CHÍNH Page bị FB render thành "comment" mới (kèm @tên người được nhắc) →
  // poll sau bắt lại → bot tự trả lời chính mình (loop) hoặc fail liên tục. FB không trả
  // authorId nên không lọc theo id được → đối chiếu nội dung với các reply Page đã gửi cho
  // post này. Chỉ so các reply đủ dài để tránh khớp nhầm câu ngắn.
  const sentReplies = repliedDocs
    .map((c) => normalizeText(c.replyText ?? ''))
    .filter((t) => t.length >= 12)
  const isOwnReply = (text: string): boolean => {
    const t = normalizeText(text)
    if (t.length < 12) return false // chừa comment ngắn của khách (vd "cảm ơn shop")
    return sentReplies.some((r) => t.includes(r) || r.includes(t))
  }

  let replied = 0
  let skipped = 0

  for (const comment of comments) {
    if (existingReplied.has(comment.id)) continue
    if (isOwnReply(comment.text)) {
      // Bỏ qua reply của chính Page — không tạo Comment row, không gọi LLM, không reply.
      continue
    }

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

    const success = await sendReply(comment, replyResult.reply)

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
