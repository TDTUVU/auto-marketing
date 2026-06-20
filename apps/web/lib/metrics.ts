import { connectDB } from './db'
import { Account, Post, PostMetric, type IMetricSnapshot } from './db/schema'
import { loadSessionForAccount } from './session'
import {
  fetchTweetMetrics,
  fetchFacebookMetrics,
  fetchFacebookPageInsights,
} from '@automation/core'
import type { PostMetrics, SessionData, FacebookPageInsightEntry } from '@automation/core'

/** Chuẩn hóa text để khớp bài (content) với title từ bảng Business Suite. */
function normContent(s: string): string {
  return s.replace(/[…\s]+$/u, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Cache insights theo pageId trong vòng đời worker — tránh mở Business Suite
// lại cho từng bài khi refresh hàng loạt (Business Suite trả mọi bài 1 lần).
const PAGE_INSIGHTS_TTL_MS = 3 * 60_000
const pageInsightsCache = new Map<string, { ts: number; entries: FacebookPageInsightEntry[] }>()

async function getPageInsights(
  session: SessionData,
  pageId: string
): Promise<FacebookPageInsightEntry[]> {
  const cached = pageInsightsCache.get(pageId)
  if (cached && Date.now() - cached.ts < PAGE_INSIGHTS_TTL_MS) return cached.entries
  const entries = await fetchFacebookPageInsights(session, pageId)
  pageInsightsCache.set(pageId, { ts: Date.now(), entries })
  return entries
}

/**
 * Khớp 1 bài với entry insights theo nội dung. Tiêu đề trong bảng Business Suite
 * thường bị cắt "…" → khớp theo PREFIX: một bên là prefix của bên kia.
 */
function matchInsight(
  entries: FacebookPageInsightEntry[],
  content: string
): FacebookPageInsightEntry | undefined {
  const post = normContent(content)
  if (post.length < 8) return undefined
  return entries.find((e) => {
    const title = normContent(e.title)
    if (title.length < 8) return false
    const n = Math.min(title.length, post.length)
    return post.slice(0, n) === title.slice(0, n)
  })
}

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
      // Page (có pageId) → bổ sung "views" + reach thật từ bảng Business Suite
      // (bài text/ảnh thường FB không trả view qua feedback object). Đọc 1 lần/page
      // (cache theo process), khớp bài theo nội dung. Lỗi insights không làm hỏng
      // cả lần lấy metrics — chỉ là thiếu views. Tắt bằng FB_PAGE_INSIGHTS=false.
      if (account.pageId && process.env['FB_PAGE_INSIGHTS'] !== 'false') {
        try {
          const entries = await getPageInsights(session, account.pageId)
          const match = matchInsight(entries, post.content)
          if (match?.views != null) metrics.views = match.views
        } catch (err) {
          console.error('[metrics] Page insights lỗi (bỏ qua views):', err instanceof Error ? err.message : err)
        }
      }
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
