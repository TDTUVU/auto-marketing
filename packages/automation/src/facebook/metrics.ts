import { chromium } from 'playwright'
import type { CookieData, PostMetrics, SessionData } from '../types.js'

function toNum(v: unknown): number | undefined {
  if (v == null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** "1,2 N" / "1.2K" / "3,4 Tr" / "1.234" → số nguyên. Best-effort cho i18n string. */
function parseHuman(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v !== 'string') return undefined
  const cleaned = v.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const m = cleaned.match(/([\d.]+)([KMkmTr]*)/)
  if (!m?.[1]) return undefined
  let n = parseFloat(m[1])
  if (!Number.isFinite(n)) return undefined
  const suffix = (m[2] ?? '').toUpperCase()
  if (suffix === 'K' || suffix === 'N') n *= 1_000
  else if (suffix === 'M' || suffix === 'TR') n *= 1_000_000
  return Math.round(n)
}

interface FeedbackCandidate {
  likes: number
  comments: number
  shares: number
  views?: number
  hasShareCount: boolean
  /** Message của Story chứa feedback này — dùng để khớp với bài focal. */
  message?: string
}

/**
 * Đọc các chỉ số từ 1 object feedback của Facebook.
 * Field thay đổi theo surface — thử nhiều path phổ biến.
 */
function readFeedback(fb: Record<string, unknown>): FeedbackCandidate | null {
  const reactionObj = fb['reaction_count'] as Record<string, unknown> | undefined
  const likes = toNum(reactionObj?.['count']) ?? parseHuman(fb['i18n_reaction_count'])
  if (likes == null) return null

  const shareObj = fb['share_count'] as Record<string, unknown> | undefined
  const shares =
    toNum(shareObj?.['count']) ??
    parseHuman(fb['i18n_share_count']) ??
    toNum(fb['share_count_reduced'])
  const hasShareCount = shareObj != null || fb['i18n_share_count'] != null

  const cri = fb['comment_rendering_instance'] as Record<string, unknown> | undefined
  const criComments = cri?.['comments'] as Record<string, unknown> | undefined
  const commentCountObj = fb['comment_count'] as Record<string, unknown> | undefined
  const comments =
    toNum(fb['total_comment_count']) ??
    toNum(criComments?.['total_count']) ??
    toNum(commentCountObj?.['total_count']) ??
    parseHuman(fb['i18n_comment_count'])

  const views =
    toNum(fb['video_view_count']) ??
    toNum(fb['video_post_view_count']) ??
    toNum(fb['play_count'])

  const candidate: FeedbackCandidate = {
    likes,
    comments: comments ?? 0,
    shares: shares ?? 0,
    hasShareCount,
  }
  if (views != null) candidate.views = views
  return candidate
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/**
 * Tìm message text của 1 Story node. Không lặn vào Story con (bài share/gợi ý lồng bên trong)
 * để không lấy nhầm caption của bài khác.
 */
function findStoryMessage(node: Record<string, unknown>): string | undefined {
  let result: string | undefined
  const visit = (o: unknown, depth: number, isRoot: boolean): void => {
    if (result || !o || typeof o !== 'object' || depth > 15) return
    if (Array.isArray(o)) {
      for (const item of o) visit(item, depth + 1, false)
      return
    }
    const r = o as Record<string, unknown>
    if (!isRoot && r['__typename'] === 'Story') return // không lặn vào Story con
    const msg = r['message'] as Record<string, unknown> | undefined
    const text = msg?.['text']
    if (typeof text === 'string' && text.trim().length > 0) {
      result = text
      return
    }
    for (const value of Object.values(r)) {
      visit(value, depth + 1, false)
      if (result) return
    }
  }
  visit(node, 0, true)
  return result
}

/**
 * Đệ quy tìm mọi object feedback (có reaction_count / i18n_reaction_count).
 * Truyền message của Story bao quanh xuống để gắn vào candidate → khớp bài focal sau.
 */
function collectFeedback(
  obj: unknown,
  out: FeedbackCandidate[],
  nearestMessage?: string,
  depth = 0
): void {
  if (!obj || typeof obj !== 'object' || depth > 30) return

  if (Array.isArray(obj)) {
    for (const item of obj) collectFeedback(item, out, nearestMessage, depth + 1)
    return
  }

  const record = obj as Record<string, unknown>
  let message = nearestMessage
  if (record['__typename'] === 'Story') {
    const storyMessage = findStoryMessage(record)
    if (storyMessage) message = storyMessage
  }

  if ('reaction_count' in record || 'i18n_reaction_count' in record) {
    const c = readFeedback(record)
    if (c) {
      if (message) c.message = message
      out.push(c)
    }
  }

  for (const value of Object.values(record)) collectFeedback(value, out, message, depth + 1)
}

/** Lấy needle từ <title> trang ("<Page> - <caption>…") để khớp message bài focal. */
function focalNeedle(title: string): string {
  const sep = title.indexOf(' - ')
  const postPart = sep >= 0 ? title.slice(sep + 3) : title
  const norm = normalizeText(postPart).replace(/ facebook$/, '')
  return norm.slice(0, 40)
}

/**
 * Chọn feedback của bài focal. Tin cậy nhất: candidate có message khớp <title> trang.
 * Fallback (khi không có title/không khớp): heuristic cũ — ưu tiên có share_count, max tương tác.
 */
function pickFocal(candidates: FeedbackCandidate[], needle: string): FeedbackCandidate | null {
  if (candidates.length === 0) return null
  const byInteraction = (a: FeedbackCandidate, b: FeedbackCandidate): number =>
    b.likes + b.comments + b.shares - (a.likes + a.comments + a.shares)

  if (needle.length >= 8) {
    const matches = candidates.filter(
      (c) => c.message && normalizeText(c.message).includes(needle)
    )
    if (matches.length > 0) return [...matches].sort(byInteraction)[0] ?? null
    console.log(`[Facebook:metrics] không có candidate khớp title — dùng fallback heuristic`)
  }

  const withShare = candidates.filter((c) => c.hasShareCount)
  const pool = withShare.length > 0 ? withShare : candidates
  return [...pool].sort(byInteraction)[0] ?? null
}

function normalizePostUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.pathname === '/permalink.php') {
      const storyFbid = parsed.searchParams.get('story_fbid')
      const id = parsed.searchParams.get('id')
      if (storyFbid && id) return `https://www.facebook.com/${id}/posts/${storyFbid}`
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

/** Tách các blob JSON nhúng SSR (<script type="application/json">…</script>). */
function extractSsrJsonBlobs(html: string): string[] {
  const blobs: string[] = []
  const re = /<script[^>]+type="application\/json"[^>]*>(.*?)<\/script>/gs
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (m[1]) blobs.push(m[1])
  }
  return blobs
}

/**
 * Lấy metrics của 1 bài Facebook bằng trình duyệt thật (Playwright).
 *
 * Lớp 1: intercept response GraphQL (feedback object).
 * Lớp 2: quét JSON nhúng SSR nếu GraphQL không trả feedback.
 */
export async function fetchFacebookMetrics(
  session: SessionData,
  postUrl: string
): Promise<PostMetrics> {
  const url = normalizePostUrl(postUrl)
  console.log(`[Facebook:metrics] navigating to: ${url}`)

  // Mặc định headless. Đặt METRICS_HEADLESS=false để debug bằng cửa sổ thật.
  const headless = process.env['METRICS_HEADLESS'] !== 'false'
  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  })

  const context = await browser.newContext({
    userAgent: session.userAgent,
    extraHTTPHeaders: { 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8' },
  })

  await context.addCookies(cookiesToPlaywright(session.cookies))

  const page = await context.newPage()
  const candidates: FeedbackCandidate[] = []
  let graphqlCount = 0
  let needle = ''

  // Lớp 1 — intercept GraphQL responses
  page.on('response', (response) => {
    if (!response.url().includes('facebook.com/api/graphql')) return
    graphqlCount++

    response.text().then((raw) => {
      const cleaned = raw.startsWith('for (;;);') ? raw.slice('for (;;);'.length) : raw
      for (const chunk of cleaned.split('\n')) {
        const trimmed = chunk.trim()
        if (!trimmed.startsWith('{')) continue
        try {
          collectFeedback(JSON.parse(trimmed), candidates)
        } catch { /* ignore non-JSON */ }
      }
    }).catch(() => { /* ignore */ })
  })

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    const title = await page.title()
    needle = focalNeedle(title)
    console.log(`[Facebook:metrics] page title: ${title}`)
    console.log(`[Facebook:metrics] focal needle: "${needle}"`)

    // Scroll nhẹ để kích GraphQL feedback nếu render động
    for (let i = 0; i < 3 && candidates.length === 0; i++) {
      await page.evaluate('window.scrollBy(0, 600)')
      await page.waitForTimeout(2000)
    }

    // Lớp 2 — quét JSON nhúng SSR
    if (candidates.length === 0) {
      const html = await page.content()
      for (const blob of extractSsrJsonBlobs(html)) {
        try {
          collectFeedback(JSON.parse(blob), candidates)
        } catch { /* ignore */ }
      }
      console.log(`[Facebook:metrics] SSR scan — ${candidates.length} feedback candidate(s)`)
    }

    console.log(`[Facebook:metrics] ${graphqlCount} GraphQL responses, ${candidates.length} candidate(s)`)
  } finally {
    await browser.close()
  }

  const focal = pickFocal(candidates, needle)
  if (!focal) {
    throw new Error(
      `Không lấy được metrics cho bài ${url} (graphql:${graphqlCount}) — có thể bị xóa, private, hoặc session hết hạn`
    )
  }

  const m: PostMetrics = { likes: focal.likes, comments: focal.comments, shares: focal.shares }
  if (focal.views != null) m.views = focal.views

  console.log(
    `[Facebook:metrics] focal message: ${focal.message ? `"${focal.message.slice(0, 50)}…"` : '(không khớp title — fallback)'}`
  )
  console.log(
    `[Facebook:metrics] views:${m.views ?? '?'} likes:${m.likes} comments:${m.comments} shares:${m.shares}`
  )
  return m
}
