import { connectDB } from './db'
import { Account, Post, PostMetric, type IMetricSnapshot } from './db/schema'
import { loadSessionForAccount } from './session'
import { fetchTweetMetrics } from '@automation/core'
import type { PostMetrics } from '@automation/core'

/**
 * Lấy metrics live của 1 bài đăng, lưu snapshot vào PostMetric (time-series)
 * và cập nhật latestMetrics trên Post. Dùng chung cho API refresh + poll worker.
 *
 * Phase 1: chỉ Twitter. Facebook sẽ thêm ở Phase 2 (Playwright).
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
    default:
      throw new Error(`Platform "${account.platform}" chưa hỗ trợ lấy metrics (Phase 1: chỉ Twitter)`)
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
