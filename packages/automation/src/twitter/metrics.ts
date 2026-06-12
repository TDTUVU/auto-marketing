import { chromium } from 'playwright'
import type { CookieData, PostMetrics, SessionData } from '../types.js'
import { extractTweetId } from './comments.js'

function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Tìm focal tweet (rest_id === tweetId) trong response GraphQL và đọc metrics.
 * Tweet object: { rest_id, legacy: { favorite_count, retweet_count, reply_count, quote_count, bookmark_count }, views: { count } }
 */
function findTweetMetrics(obj: unknown, tweetId: string, depth = 0): PostMetrics | null {
  if (!obj || typeof obj !== 'object' || depth > 30) return null

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findTweetMetrics(item, tweetId, depth + 1)
      if (found) return found
    }
    return null
  }

  const record = obj as Record<string, unknown>

  const result = record['result'] as Record<string, unknown> | undefined
  const tweet = result?.['tweet'] as Record<string, unknown> | undefined
  const tweetData = tweet ?? result
  const typename = tweetData?.['__typename'] as string | undefined

  if (typename === 'Tweet' && tweetData?.['rest_id'] === tweetId) {
    const legacy = tweetData['legacy'] as Record<string, unknown> | undefined
    const views = tweetData['views'] as Record<string, unknown> | undefined
    if (legacy) {
      const m: PostMetrics = {
        likes: toNum(legacy['favorite_count']),
        comments: toNum(legacy['reply_count']),
        shares: toNum(legacy['retweet_count']) + toNum(legacy['quote_count']),
      }
      if (views?.['count'] != null) m.views = toNum(views['count'])
      if (legacy['bookmark_count'] != null) m.saves = toNum(legacy['bookmark_count'])
      return m
    }
  }

  for (const value of Object.values(record)) {
    const found = findTweetMetrics(value, tweetId, depth + 1)
    if (found) return found
  }
  return null
}

function cookiesToPlaywright(cookies: CookieData[]) {
  return cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
    path: c.path,
    expires: c.expires ?? -1,
    httpOnly: c.httpOnly ?? false,
    secure: c.secure ?? true,
    sameSite: 'Lax' as const,
  }))
}

/**
 * Lấy metrics của 1 tweet bằng trình duyệt thật (Playwright).
 *
 * Replay GraphQL bằng undici bị X chặn (error 226) vì thiếu header
 * x-client-transaction-id tính động. Mở tweet trong browser thật rồi
 * intercept response GraphQL → browser tự sinh đủ header hợp lệ.
 */
export async function fetchTweetMetrics(
  session: SessionData,
  tweetUrl: string
): Promise<PostMetrics> {
  const tweetId = extractTweetId(tweetUrl)
  if (!tweetId) throw new Error(`Cannot extract tweet ID from URL: ${tweetUrl}`)

  console.log(`[Twitter:metrics] navigating to tweet ${tweetId}`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  })

  const context = await browser.newContext({
    userAgent: session.userAgent,
    extraHTTPHeaders: { 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8' },
  })

  await context.addCookies(cookiesToPlaywright(session.cookies))

  const page = await context.newPage()
  let found: PostMetrics | null = null

  // Intercept mọi response GraphQL — focal tweet nằm trong TweetDetail / TweetResultByRestId
  page.on('response', (response) => {
    const u = response.url()
    if (!u.includes('/i/api/graphql/')) return

    response.text().then((raw) => {
      if (found) return
      try {
        const json = JSON.parse(raw) as Record<string, unknown>
        const m = findTweetMetrics(json, tweetId)
        if (m) found = m
      } catch { /* ignore non-JSON */ }
    }).catch(() => { /* ignore */ })
  })

  try {
    await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    // Chờ response GraphQL được intercept (tối đa ~15s)
    for (let i = 0; i < 15 && !found; i++) {
      await page.waitForTimeout(1000)
    }
  } finally {
    await browser.close()
  }

  if (!found) {
    throw new Error(`Không lấy được metrics cho tweet ${tweetId} — có thể bị xóa, private, hoặc session hết hạn`)
  }

  const m = found as PostMetrics
  console.log(`[Twitter:metrics] tweet ${tweetId} — views:${m.views ?? '?'} likes:${m.likes} comments:${m.comments} shares:${m.shares}`)
  return m
}
