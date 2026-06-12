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

/** "1.2K" → 1200, "3.4M" → 3400000, "1,234" → 1234 */
function parseCount(text: string | null | undefined): number | undefined {
  if (!text) return undefined
  const m = text.replace(/,/g, '').match(/([\d.]+)\s*([KM]?)/i)
  if (!m?.[1]) return undefined
  let n = parseFloat(m[1])
  if (!Number.isFinite(n)) return undefined
  const suffix = (m[2] ?? '').toUpperCase()
  if (suffix === 'K') n *= 1_000
  else if (suffix === 'M') n *= 1_000_000
  return Math.round(n)
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

interface DomMetrics {
  like: string | null
  reply: string | null
  retweet: string | null
  bookmark: string | null
  views: string | null
  groupLabel: string | null
  title: string
  url: string
}

/**
 * Lấy metrics của 1 tweet bằng trình duyệt thật (Playwright).
 *
 * Lớp 1: intercept response GraphQL (số chính xác).
 * Lớp 2: nếu X render sẵn trong HTML (không gọi GraphQL), đọc thẳng từ DOM.
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
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  })

  await context.addCookies(cookiesToPlaywright(session.cookies))

  const page = await context.newPage()
  let found: PostMetrics | null = null
  let graphqlCount = 0

  // Lớp 1 — intercept mọi response GraphQL
  page.on('response', (response) => {
    const u = response.url()
    if (!u.includes('graphql')) return
    graphqlCount++

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

    // Chờ tweet render (hoặc login wall)
    try {
      await page.waitForSelector('article', { timeout: 15_000 })
    } catch { /* không có article — có thể bị chặn */ }

    // Cho GraphQL kịp về
    for (let i = 0; i < 8 && !found; i++) {
      await page.waitForTimeout(1000)
    }

    // Lớp 2 — fallback đọc DOM nếu GraphQL không bắt được
    if (!found) {
      // Truyền dưới dạng string — tránh esbuild (tsx) chèn helper __name vào hàm
      // gửi sang browser (gây ReferenceError: __name is not defined).
      const dom = await page.evaluate(`(() => {
        const article = document.querySelector('article[data-testid="tweet"]') || document.querySelector('article');
        const pick = (sel) => { const el = article && article.querySelector(sel); return el ? (el.textContent || '').trim() : null; };
        const a = article && article.querySelector('a[href$="/analytics"]');
        const grp = article && article.querySelector('[role="group"]');
        return {
          like: pick('[data-testid="like"]') || pick('[data-testid="unlike"]'),
          reply: pick('[data-testid="reply"]'),
          retweet: pick('[data-testid="retweet"]') || pick('[data-testid="unretweet"]'),
          bookmark: pick('[data-testid="bookmark"]') || pick('[data-testid="removeBookmark"]'),
          views: a ? (a.textContent || '').trim() : null,
          groupLabel: grp ? grp.getAttribute('aria-label') : null,
          title: document.title,
          url: location.href,
        };
      })()`) as DomMetrics

      console.log(`[Twitter:metrics] DOM fallback — title:"${dom.title}" group:"${dom.groupLabel ?? ''}"`)

      const likes = parseCount(dom.like)
      const comments = parseCount(dom.reply)
      const shares = parseCount(dom.retweet)
      // Có ít nhất 1 chỉ số đọc được mới coi là hợp lệ (tránh trang login)
      if (likes != null || comments != null || shares != null) {
        const m: PostMetrics = {
          likes: likes ?? 0,
          comments: comments ?? 0,
          shares: shares ?? 0,
        }
        const views = parseCount(dom.views)
        const saves = parseCount(dom.bookmark)
        if (views != null) m.views = views
        if (saves != null) m.saves = saves
        found = m
      }
    }

    console.log(`[Twitter:metrics] graphql responses seen: ${graphqlCount}, page: ${page.url()}`)
  } finally {
    await browser.close()
  }

  if (!found) {
    throw new Error(
      `Không lấy được metrics cho tweet ${tweetId} (graphql:${graphqlCount}) — có thể bị xóa, private, hoặc session hết hạn`
    )
  }

  const m = found as PostMetrics
  console.log(`[Twitter:metrics] tweet ${tweetId} — views:${m.views ?? '?'} likes:${m.likes} comments:${m.comments} shares:${m.shares}`)
  return m
}
