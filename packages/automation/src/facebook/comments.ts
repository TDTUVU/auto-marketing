import { chromium } from 'playwright'
import type { BrowserContext } from 'playwright'
import type { CookieData, SessionData } from '../types.js'
import { persistCookies, type CookieSink } from './session.js'

export interface CommentData {
  feedbackId: string
  authorId: string
  authorName: string
  text: string
  hasOwnerReply: boolean
}

/**
 * Extract comments directly from raw HTML.
 * Facebook SSR embeds comment data in inline script tags with structure:
 *   "feedback":{"id":"ZmVlZGJh..."} ... "body":{"text":"..."} ... "__typename":"Comment"
 * __typename appears at the END of each comment node.
 */
/**
 * Extract the JSON string value starting at position `pos` (after the opening quote).
 * Returns the raw string content and the position after the closing quote.
 */
function extractJsonString(html: string, pos: number): { value: string; end: number } | null {
  let i = pos
  let raw = ''
  while (i < html.length) {
    const ch = html[i]!
    if (ch === '\\' && i + 1 < html.length) {
      raw += ch + html[i + 1]!
      i += 2
    } else if (ch === '"') {
      return { value: raw, end: i + 1 }
    } else {
      raw += ch
      i++
    }
  }
  return null
}

function extractCommentsFromHtml(html: string, ownerId: string): CommentData[] {
  const results: CommentData[] = []
  const seen = new Set<string>()
  const bodyMarker = '"body":{"text":"'
  let pos = 0
  let matchIndex = 0

  while (true) {
    const bodyIdx = html.indexOf(bodyMarker, pos)
    if (bodyIdx === -1) break
    pos = bodyIdx + bodyMarker.length

    // Extract the text value
    const extracted = extractJsonString(html, pos)
    if (!extracted) continue

    matchIndex++
    let text: string
    try {
      text = JSON.parse(`"${extracted.value}"`) as string
    } catch {
      text = extracted.value
    }

    // Look backwards for feedback.id — presence of feedback.id confirms this is a comment
    const beforeStart = Math.max(0, bodyIdx - 5000)
    const beforeWindow = html.slice(beforeStart, bodyIdx)
    const feedbackMatches = [...beforeWindow.matchAll(/"feedback":\{"id":"([^"]+)"/g)]

    if (feedbackMatches.length === 0 || !text) continue

    // Deduplicate by text — Facebook embeds same comment twice with different feedbackIds
    if (seen.has(text)) continue
    seen.add(text)

    const feedbackId = feedbackMatches[feedbackMatches.length - 1]![1]!
    console.log(`[extractComments] comment: "${text.slice(0, 50)}" feedbackId=${feedbackId.slice(0, 40)}...`)

    // author
    const authorMatch = beforeWindow.match(/"author":\{[^}]*?"id":"(\d+)"[^}]*?"name":"((?:[^"\\]|\\.)*)"/s)
    const authorId = authorMatch?.[1] ?? ''
    let authorName = authorMatch?.[2] ?? ''
    if (authorName) {
      try { authorName = JSON.parse(`"${authorName}"`) as string } catch { /* keep raw */ }
    }

    if (authorId && authorId === ownerId) continue

    results.push({ feedbackId, authorId, authorName, text, hasOwnerReply: false })
  }

  return results
}

/**
 * Recursive search qua parsed JSON (cho GraphQL responses).
 */
function deepFindComments(
  obj: unknown,
  ownerId: string,
  out: Map<string, CommentData>,
  depth = 0
): void {
  if (!obj || typeof obj !== 'object' || depth > 20) return

  if (Array.isArray(obj)) {
    for (const item of obj) deepFindComments(item, ownerId, out, depth + 1)
    return
  }

  const record = obj as Record<string, unknown>

  const id = record['id'] as string | undefined
  const author = record['author'] as Record<string, unknown> | undefined
  const body = record['body'] as Record<string, unknown> | undefined
  const feedback = record['feedback'] as Record<string, unknown> | undefined

  if (body && (id ?? feedback)) {
    const authorId = (author?.['id'] ?? '') as string
    const authorName = (author?.['name'] ?? '') as string
    const text = (body['text'] ?? '') as string
    const commentFeedbackId = (feedback?.['id'] ?? id ?? '') as string

    if (text && commentFeedbackId && authorId !== ownerId) {
      const replies = record['replies'] as Record<string, unknown> | undefined
      const replyEdges = (replies?.['edges'] ?? replies?.['nodes']) as Array<Record<string, unknown>> | undefined
      const hasOwnerReply = Array.isArray(replyEdges) && replyEdges.some((re) => {
        const rn = (re['node'] ?? re) as Record<string, unknown> | undefined
        const ra = rn?.['author'] as Record<string, unknown> | undefined
        return (ra?.['id'] as string) === ownerId
      })

      out.set(commentFeedbackId, { feedbackId: commentFeedbackId, authorId, authorName, text, hasOwnerReply })
    }
  }

  for (const value of Object.values(record)) {
    deepFindComments(value, ownerId, out, depth + 1)
  }
}

// Các nhãn UI Facebook tự chèn (thẻ gợi ý group/page, quảng cáo, "người bạn có thể biết"…).
// Extractor bắt nhầm chúng như comment vì cũng có cấu trúc body.text + feedback.id.
// Lọc sớm để không tạo row Comment / không gọi LLM cho rác.
const FB_SUGGESTION_PREFIXES = [
  'có thể bạn sẽ thích',
  'gợi ý cho bạn',
  'trang bạn có thể thích',
  'nhóm bạn có thể thích',
  'những người bạn có thể biết',
  'người bạn có thể biết',
  'được tài trợ',
  'sponsored',
  'suggested for you',
  'suggested groups',
  'suggested pages',
  'people you may know',
]

// Text "notification" FB nhồi sẵn vào HTML trang post (jewel thông báo) — bị bắt nhầm
// thành comment khi poll trước lúc comment render. Đây là tường thuật hệ thống (ngôi thứ 3),
// KHÔNG phải nội dung comment khách. Lọc bằng cụm đặc trưng (dùng includes vì tên đứng đầu).
const FB_NOTIFICATION_PATTERNS = [
  'đã bình luận về bài viết',
  'đã bình luận về ảnh',
  'đã trả lời bình luận',
  'đã thích bài viết của bạn',
  'đã thích bình luận',
  'thích ảnh của bạn',
  'người theo dõi, thích',
  'đã chia sẻ bài viết',
  'commented on your',
  'liked your photo',
  'replied to your comment',
]

function isFacebookNoise(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (FB_SUGGESTION_PREFIXES.some((p) => t.startsWith(p))) return true
  if (FB_NOTIFICATION_PATTERNS.some((p) => t.includes(p))) return true
  return false
}

function normalizePostUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.pathname === '/permalink.php') {
      const storyFbid = parsed.searchParams.get('story_fbid')
      const id = parsed.searchParams.get('id')
      if (storyFbid && id) {
        return `https://www.facebook.com/${id}/posts/${storyFbid}`
      }
    }
    return url
  } catch {
    return url
  }
}

function cookiesToPlaywright(cookies: CookieData[]) {
  return cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
    path: c.path,
    expires: c.expires ?? -1,
    httpOnly: c.httpOnly ?? false,
    secure: c.secure ?? false,
    sameSite: 'Lax' as const,
  }))
}

export async function fetchPostComments(
  session: SessionData,
  postUrl: string,
  opts: { onCookies?: CookieSink } = {}
): Promise<CommentData[]> {
  const url = normalizePostUrl(postUrl)
  console.log(`[fetchPostComments] navigating to: ${url}`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  })

  const context: BrowserContext = await browser.newContext({
    userAgent: session.userAgent,
    extraHTTPHeaders: { 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8' },
  })

  await context.addCookies(cookiesToPlaywright(session.cookies))

  const page = await context.newPage()
  const found = new Map<string, CommentData>()
  let graphqlCount = 0

  // Intercept GraphQL responses (for SPA navigation / dynamic loads)
  page.on('response', (response) => {
    if (!response.url().includes('facebook.com/api/graphql')) return
    graphqlCount++

    response.text().then((raw) => {
      const cleaned = raw.startsWith('for (;;);') ? raw.slice(9) : raw
      for (const chunk of cleaned.split('\n')) {
        const trimmed = chunk.trim()
        if (!trimmed || !trimmed.startsWith('{')) continue
        try {
          const json = JSON.parse(trimmed) as Record<string, unknown>
          deepFindComments(json, session.userId, found)
        } catch { /* ignore */ }
      }
    }).catch(() => { /* ignore */ })
  })

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForTimeout(5000)

    const title = await page.title()
    console.log(`[fetchPostComments] page title: ${title}`)

    // Scroll to trigger lazy-load
    for (let i = 0; i < 3; i++) {
      await page.evaluate('window.scrollBy(0, 800)')
      await page.waitForTimeout(2000)
    }

    // Click "more comments" if present
    try {
      const moreBtn = page.locator('[role="button"]:has-text("bình luận"), [role="button"]:has-text("comment")')
      const count = await moreBtn.count()
      if (count > 0) {
        await moreBtn.first().click()
        await page.waitForTimeout(3000)
      }
    } catch { /* no button */ }

    // Extract comments from SSR HTML (inline script tags)
    if (found.size === 0) {
      const html = await page.content()
      const htmlComments = extractCommentsFromHtml(html, session.userId)
      for (const c of htmlComments) {
        if (!found.has(c.feedbackId)) {
          found.set(c.feedbackId, c)
        }
      }
      console.log(`[fetchPostComments] SSR extraction: ${htmlComments.length} comments from HTML`)
    }

    console.log(`[fetchPostComments] ${url} — ${graphqlCount} GraphQL, ${found.size} comments total`)
  } finally {
    await persistCookies(context, opts.onCookies)
    await browser.close()
  }

  const all = Array.from(found.values()).filter((c) => !c.hasOwnerReply)
  const comments = all.filter((c) => !isFacebookNoise(c.text))
  const dropped = all.length - comments.length
  if (dropped > 0) {
    console.log(`[fetchPostComments] bỏ qua ${dropped} thẻ gợi ý/quảng cáo/thông báo FB (không phải comment)`)
  }
  return comments
}
