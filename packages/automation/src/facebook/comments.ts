import { chromium } from 'playwright'
import type { CookieData, SessionData } from '../types.js'

export interface CommentData {
  feedbackId: string   // Facebook internal ID dùng cho createComment()
  authorId: string
  authorName: string
  text: string
  hasOwnerReply: boolean
}

/** Parse một GraphQL response blob, tìm comment nodes */
function extractCommentsFromJson(
  json: Record<string, unknown>,
  ownerId: string,
  out: Map<string, CommentData>
): void {
  // Facebook có nhiều query shape khác nhau — thử các path phổ biến
  const candidates: unknown[] = [
    // CometUFICommentsProviderQuery
    (json['data'] as Record<string, unknown> | undefined)?.['feedback'],
    // PolarisPostFeedback
    (json['data'] as Record<string, unknown> | undefined)?.['node'],
  ]

  for (const candidate of candidates) {
    const feedback = candidate as Record<string, unknown> | undefined
    if (!feedback) continue

    const displayComments = (
      (feedback['display_comments'] ?? feedback['ufi_summary_and_actions_renderer']) as Record<string, unknown> | undefined
    )

    if (!displayComments) continue

    const edges = displayComments['edges'] as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(edges)) continue

    for (const edge of edges) {
      const node = edge['node'] as Record<string, unknown> | undefined
      if (!node) continue

      const feedbackId = node['id'] as string | undefined
      if (!feedbackId) continue

      const author = node['author'] as Record<string, unknown> | undefined
      const authorId = (author?.['id'] ?? '') as string
      const authorName = (author?.['name'] ?? '') as string

      const body = node['body'] as Record<string, unknown> | undefined
      const text = (body?.['text'] ?? '') as string

      // Kiểm tra owner đã reply chưa
      const replies = node['replies'] as Record<string, unknown> | undefined
      const replyEdges = replies?.['edges'] as Array<Record<string, unknown>> | undefined
      const hasOwnerReply = replyEdges?.some((re) => {
        const rn = re['node'] as Record<string, unknown> | undefined
        const ra = rn?.['author'] as Record<string, unknown> | undefined
        return (ra?.['id'] as string) === ownerId
      }) ?? false

      if (authorId && text) {
        out.set(feedbackId, { feedbackId, authorId, authorName, text, hasOwnerReply })
      }
    }
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

/**
 * Mở post URL bằng Playwright, intercept GraphQL responses để lấy comments.
 * Chỉ trả về comments mà page owner (session.userId) chưa reply.
 */
export async function fetchPostComments(
  session: SessionData,
  postUrl: string
): Promise<CommentData[]> {
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
  const found = new Map<string, CommentData>()

  // Intercept tất cả GraphQL responses khi page load
  page.on('response', (response) => {
    if (!response.url().includes('facebook.com/api/graphql')) return

    response.text().then((raw) => {
      const cleaned = raw.startsWith('for (;;);') ? raw.slice(9) : raw
      try {
        const json = JSON.parse(cleaned) as Record<string, unknown>
        extractCommentsFromJson(json, session.userId, found)
      } catch { /* ignore parse errors */ }
    }).catch(() => { /* ignore */ })
  })

  try {
    await page.goto(postUrl, { waitUntil: 'networkidle', timeout: 30_000 })
    // Đợi thêm một chút để lazy-load comments xong
    await page.waitForTimeout(3000)
  } finally {
    await browser.close()
  }

  // Lọc: chỉ trả về comment chưa có reply từ owner
  return Array.from(found.values()).filter((c) => !c.hasOwnerReply)
}
