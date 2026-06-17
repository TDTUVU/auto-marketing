import { connectDB } from './db'
import { Account, Post, PostMetric, type IMetricSnapshot } from './db/schema'
import { loadSessionForAccount } from './session'
import { fetchTweetMetrics, fetchFacebookMetrics } from '@automation/core'
import type { PostMetrics } from '@automation/core'

/**
 * Lấy metrics live của 1 bài đăng, lưu snapshot vào PostMetric (time-series)
 * và cập nhật latestMetrics trên Post. Dùng chung cho API refresh + poll worker.
 *
 * Hỗ trợ Twitter (GraphQL intercept) + Facebook (feedback object). Cả hai chạy Playwright ở worker.
 */
export async function capturePostMetrics(postId: string): Promise<IMetricSnapshot> {
  await connectDB()

  const post = await Post.findById(postId)
  if (!post) throw new Error('Post not found')
  if (post.status !== 'published') {
    throw new Error(`Post chưa published (status: ${post.status})`)
  }

  const url = post.platformPostId
  if (!url) throw new Error('Post không có URL bài viết — chưa thể lấy metrics')

  const account = await Account.findById(post.accountId)
  if (!account) throw new Error('Account not found')

  const session = await loadSessionForAccount(post.accountId.toString())
  if (!session) throw new Error('Session not found for account')

  let metrics: PostMetrics
  switch (account.platform) {
    case 'twitter': {
      metrics = await fetchTweetMetrics(session, url)
      break
    }
    case 'facebook': {
      metrics = await fetchFacebookMetrics(session, url)
      break
    }
    default:
      throw new Error(`Platform "${account.platform}" chưa hỗ trợ lấy metrics (hiện hỗ trợ Twitter, Facebook)`)
  }

  const capturedAt = new Date()

  await PostMetric.create({
    postId: post._id,
    accountId: post.accountId,
    platform: account.platform,
    ...metrics,
    capturedAt,
  })

  const snapshot: IMetricSnapshot = { ...metrics, capturedAt }
  await Post.findByIdAndUpdate(postId, { latestMetrics: snapshot })

  return snapshot
}
