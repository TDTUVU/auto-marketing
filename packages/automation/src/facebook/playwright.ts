import { chromium } from 'playwright'
import type { BrowserContext, Locator, Page } from 'playwright'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { AutomationResult, CookieData, PostPayload } from '../types.js'
import { persistCookies, type CookieSink } from './session.js'

// Mặc định headless. Đặt FACEBOOK_HEADLESS=false để chạy browser thật có giao diện
// khi cần debug selector (FB hay đổi DOM + phụ thuộc locale tiếng Việt).
const HEADLESS = process.env['FACEBOOK_HEADLESS'] !== 'false'

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// FB render emoji (cờ, mặt cười…) thành <img>, KHÔNG nằm trong textContent. Nếu để emoji
// trong chuỗi tìm comment (hasText), substring match sẽ trượt → không định vị được comment
// có cả chữ lẫn emoji. Bỏ emoji + gộp khoảng trắng để snippet chỉ còn phần chữ thật sự
// hiện trong DOM (img rỗng làm hai đoạn text liền nhau sau khi normalize whitespace).
function stripEmoji(s: string): string {
  return (s ?? '')
    .replace(
      /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()
}

// Cùng cách inject cookie đã chứng minh chạy được ở comments.ts (đọc comment FB).
function cookiesToPlaywright(cookies: CookieData[]) {
  return cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
    path: c.path || '/',
    expires: c.expires ?? -1,
    httpOnly: c.httpOnly ?? false,
    secure: c.secure ?? false,
    sameSite: 'Lax' as const,
  }))
}

function getCookie(cookies: CookieData[], name: string): string | undefined {
  return cookies.find((c) => c.name === name)?.value
}

function isLoggedOutUrl(url: string): boolean {
  return /\/login|\/checkpoint|\/recover|two_step|\/authentication/.test(url)
}

/**
 * Focus ô soạn, chịu được overlay tạm thời che mất (giống focusEditor bên X).
 * Click thường vài lần để overlay kịp biến mất, vẫn kẹt thì force-click.
 */
async function focusEditor(editor: Locator): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await editor.click({ timeout: 8_000 })
      return
    } catch {
      if (attempt < 3) await randomDelay(800, 1500)
    }
  }
  await editor.click({ force: true, timeout: 8_000 })
}

/**
 * Bắt URL bài vừa đăng từ response GraphQL của FB (ComposerStoryCreateMutation).
 * Tìm theo nhiều pattern vì cấu trúc response thay đổi; fallback dựng permalink từ
 * story_fbid + id của Page (pageId = i_user khi đang ở ngữ cảnh Page).
 */
function extractPostUrlFromJson(json: Record<string, unknown>, pageId?: string): string | undefined {
  const str = JSON.stringify(json)

  // 1) URL bài trực tiếp (.../posts/... hoặc permalink)
  const urlMatch =
    str.match(/"url"\s*:\s*"(https:\\?\/\\?\/www\.facebook\.com\\?\/[^"]*\\?\/posts\\?\/[^"]+)"/) ??
    str.match(/"url"\s*:\s*"(\\?\/[^"]*\\?\/posts\\?\/[^"]+)"/)
  if (urlMatch?.[1]) {
    const url = urlMatch[1].replace(/\\\//g, '/')
    return url.startsWith('http') ? url : `https://www.facebook.com${url}`
  }

  // 2) story_fbid / post_id → dựng permalink
  const idMatch =
    str.match(/"post_id"\s*:\s*"(\d+)"/) ?? str.match(/"story_id"\s*:\s*"(\d+)"/)
  if (idMatch && pageId) {
    return `https://www.facebook.com/${pageId}/posts/${idMatch[1]}`
  }

  return undefined
}

// Sinh vài "needle" để nhận diện bài VỪA đăng: dùng để khớp nội dung trong response
// GraphQL (đảm bảo đúng bài của mình, không phải bài cũ trong feed) và để verify trên DOM.
// Bỏ ký tự đầu không phải chữ/số (vd emoji) để lấy đoạn ổn định.
function buildTextNeedles(text: string): string[] {
  const norm = text.replace(/\s+/g, ' ').trim()
  const out = new Set<string>()
  const m = norm.match(/[\p{L}\p{N}][\p{L}\p{N} ]{9,40}/u)
  if (m) out.add(m[0].trim())
  const head = norm.slice(0, 40).trim()
  if (head.length >= 8) out.add(head)
  return [...out].filter((n) => n.length >= 8)
}

// FB (Page) đôi khi bật popup gợi ý SAU khi bấm Đăng (vd "Thêm nút Gọi ngay" /
// "Trò chuyện trực tiếp với mọi người"). Popup này CHẶN việc commit bài — phải đóng
// (bấm "Lúc khác"/"Để sau"...) thì bài mới thực sự lên. Lúc có lúc không → chỉ đóng nếu
// xuất hiện, không có thì im lặng bỏ qua.
async function dismissPostUpsell(page: Page): Promise<void> {
  try {
    const btn = page
      .locator('[role="dialog"] [role="button"]:visible, [role="dialog"] [aria-label]:visible')
      .filter({ hasText: /^Lúc khác$|^Để sau$|^Bỏ qua$|^Không phải bây giờ$|^Đóng$|^Maybe later$|^Not now$|^Skip$|^Close$/i })
      .first()
    const appeared = await btn.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)
    if (appeared) {
      console.log('[Facebook:DOM] đóng popup gợi ý sau đăng ("Lúc khác"...)')
      await btn.click({ timeout: 6000 }).catch(() => null)
      await randomDelay(1500, 2500)
    }
  } catch { /* không có popup → bỏ qua */ }
}

// Ground-truth: reload Trang và tìm nội dung vừa đăng. Dùng khi không bắt được post_id
// để tránh báo "thành công giả".
async function verifyPostOnPage(page: Page, navUrl: string, needles: string[]): Promise<boolean> {
  if (needles.length === 0) return false
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const wanted = needles.map(norm).filter((n) => n.length >= 8)
  if (wanted.length === 0) return false
  // Reload có retry: NGAY sau khi đăng, FB hay nghẽn (ERR_ADDRESS_IN_USE/timeout) làm lần
  // goto đầu fail → đừng vội kết luận "không thấy bài". So khớp bằng innerText đã chuẩn hóa
  // (FB tách caption qua nhiều span nên getByG/getByText trên chuỗi dài dễ trượt).
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => null)
      await randomDelay(2500, 4000)
      await page.evaluate('window.scrollBy(0, 400)').catch(() => null)
      await randomDelay(1500, 2500)
      const raw = (await page.evaluate('document.body.innerText').catch(() => '')) as string
      const body = norm(raw || '')
      if (body && wanted.some((n) => body.includes(n))) return true
    } catch {
      /* goto/đọc DOM lỗi do mạng nghẽn → thử lại */
    }
    if (attempt < 3) await randomDelay(2000, 4000)
  }
  return false
}

/**
 * Đăng bài lên Facebook bằng browser thật (Playwright DOM) — thay cho HTTP replay.
 *
 * Tận dụng cookie `i_user`: khi session đang ở ngữ cảnh "là Page", mở trang Page và
 * dùng composer của nó sẽ đăng dưới danh nghĩa Page mà KHÔNG cần chuyển hồ sơ.
 * Giữ phiên trong browser thật (fingerprint + JS thật) → bền hơn HTTP replay nhiều.
 */
export async function postToFacebookViaDOM(
  cookies: CookieData[],
  userAgent: string,
  payload: PostPayload,
  opts: { dryRun?: boolean; onCookies?: CookieSink } = {}
): Promise<AutomationResult> {
  // i_user = ID hồ sơ Page đang acting-as; fallback c_user (đăng tường cá nhân).
  const pageId = getCookie(cookies, 'i_user') ?? getCookie(cookies, 'c_user')

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  })
  let tmpDir: string | undefined
  let context: BrowserContext | undefined

  try {
    context = await browser.newContext({
      userAgent,
      locale: 'vi-VN',
      viewport: { width: 1366, height: 768 },
      extraHTTPHeaders: { 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8' },
    })
    await context.addCookies(cookiesToPlaywright(cookies))
    const page = await context.newPage()

    // Bắt URL bài MỚI từ response GraphQL của lệnh tạo bài. CHỈ bắt sau khi đã bấm "Đăng"
    // (postingStarted) để KHÔNG dính URL của bài cũ đang nằm trong feed lúc tải trang.
    // Ưu tiên (và khoá) response chứa đúng nội dung vừa đăng → chắc chắn đúng bài của mình.
    let capturedUrl: string | undefined
    let capturedLocked = false
    let postingStarted = false
    const textNeedles = buildTextNeedles(payload.text)
    const escNeedles = textNeedles.map((n) => JSON.stringify(n).slice(1, -1))
    page.on('response', (res) => {
      if (!postingStarted || capturedLocked) return
      if (!res.url().includes('facebook.com/api/graphql')) return
      res.text().then((raw) => {
        const cleaned = raw.startsWith('for (;;);') ? raw.slice(9) : raw
        for (const chunk of cleaned.split('\n')) {
          const t = chunk.trim()
          if (!t.startsWith('{')) continue
          try {
            const j = JSON.parse(t) as Record<string, unknown>
            const u = extractPostUrlFromJson(j, pageId)
            if (!u) continue
            // Chunk chứa đúng nội dung bài → chắc chắn bài của mình → khoá lại.
            if (textNeedles.some((n) => t.includes(n)) || escNeedles.some((n) => t.includes(n))) {
              capturedUrl = u
              capturedLocked = true
              return
            }
            // Chưa khớp nội dung: tạm giữ (best-effort), để response khớp sau ghi đè.
            if (!capturedUrl) capturedUrl = u
          } catch { /* không phải JSON bài đăng — bỏ qua */ }
        }
      }).catch(() => { /* ignore */ })
    })

    // Mở trang Page (acting-as-Page nhờ i_user) → composer ở đây đăng dưới danh nghĩa Page.
    const navUrl = pageId ? `https://www.facebook.com/${pageId}` : 'https://www.facebook.com/'
    await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await randomDelay(3000, 5000)

    if (isLoggedOutUrl(page.url())) {
      return {
        success: false,
        error: `Session Facebook không hợp lệ — bị redirect tới ${page.url()}`,
        timestamp: new Date(),
      }
    }

    // FB là SPA nặng — chờ network lắng + scroll nhẹ để ô soạn render xong, tránh flaky
    // "không thấy composer" (đôi khi chưa kịp hiện trong thời gian chờ).
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => null)
    await page.evaluate('window.scrollBy(0, 300)').catch(() => null)
    await randomDelay(1500, 2500)

    // Mở composer: bấm ô "Bạn đang nghĩ gì?" / "Tạo bài viết" (chỉ lấy element VISIBLE,
    // vì FB có sẵn nhiều bản ẩn của cùng text → .first() dễ dính bản ẩn).
    const composerOpener = page
      .locator('div[role="button"]:visible, span:visible')
      .filter({ hasText: /Bạn đang nghĩ gì|Tạo bài viết|Hãy viết gì đó|Write something|Create post|What's on your mind/i })
      .first()
    await composerOpener.waitFor({ state: 'visible', timeout: 30_000 })
    await composerOpener.click({ timeout: 15_000 })

    // Modal composer. FB render kèm dialog "Thông báo" (role="dialog" nhưng KHÔNG có
    // aria-modal) → '[role="dialog"]' khớp 2 element gây strict mode violation. Composer
    // soạn bài luôn có aria-modal="true" → scope theo đó để chọn đúng 1 dialog.
    const dialog = page.locator('[role="dialog"][aria-modal="true"]').first()
    await dialog.waitFor({ state: 'visible', timeout: 30_000 })

    // Ô soạn nội dung (contenteditable trong modal)
    const editor = dialog.locator('[role="textbox"][contenteditable="true"]').first()
    await editor.waitFor({ state: 'visible', timeout: 30_000 })
    await focusEditor(editor)
    await randomDelay(400, 900)
    await page.keyboard.type(payload.text, { delay: 20 + Math.random() * 40 })
    await randomDelay(800, 1600)

    // Upload ảnh qua input file ẩn (không cần bấm nút "Ảnh/video").
    if (payload.photos?.length) {
      tmpDir = await mkdtemp(join(tmpdir(), 'fb-upload-'))
      const paths: string[] = []
      for (let i = 0; i < payload.photos.length; i++) {
        const photo = payload.photos[i]!
        const fp = join(tmpDir, photo.filename || `image-${i}.jpg`)
        await writeFile(fp, photo.buffer)
        paths.push(fp)
      }
      const fileInput = dialog.locator('input[type="file"]').first()
      await fileInput.setInputFiles(paths)
      console.log(`[Facebook:DOM] uploading ${paths.length} photo(s)...`)
      // Chờ FB xử lý ảnh — nút Đăng bị khóa tới khi upload xong
      await randomDelay(3000, 6000)
    }

    // Composer của Page gồm 2 BƯỚC: bước soạn kết thúc bằng nút "Tiếp" (Next), bước sau
    // mới có nút "Đăng". Tường cá nhân có thể 1 bước → bỏ qua "Tiếp" nếu không có.
    const nextBtn = page.locator('[aria-label="Tiếp"][role="button"]:visible, [aria-label="Next"][role="button"]:visible').first()
    if (await nextBtn.isVisible().catch(() => false)) {
      console.log('[Facebook:DOM] composer 2 bước — bấm "Tiếp"')
      await nextBtn.click({ timeout: 10_000 })
      await randomDelay(1500, 3000)
    }

    // Nút Đăng (bước cuối) — chờ hiện & hết aria-disabled (ảnh upload xong). Chỉ lấy bản VISIBLE.
    const postButton = page
      .locator('[aria-label="Đăng"][role="button"]:not([aria-disabled="true"]):visible, [aria-label="Post"][role="button"]:not([aria-disabled="true"]):visible')
      .first()
    await postButton.waitFor({ state: 'visible', timeout: 60_000 })
    await randomDelay(600, 1400)

    // Dry-run (chỉ dùng khi test selector): đã soạn xong & nút Đăng sẵn sàng nhưng
    // KHÔNG bấm — để verify toàn bộ luồng mà không đăng thật lên Page.
    if (opts.dryRun) {
      console.log('[Facebook:DOM] DRY-RUN — soạn xong, nút Đăng sẵn sàng, KHÔNG bấm Đăng')
      await randomDelay(1500, 2500)
      return { success: true, timestamp: new Date() }
    }

    postingStarted = true // từ đây mới bắt URL bài (bỏ qua bài cũ trong feed lúc load)
    await postButton.click({ timeout: 15_000 })
    await randomDelay(2500, 4000)

    // Đóng popup gợi ý sau đăng nếu FB bật (chặn commit bài). Lúc có lúc không.
    await dismissPostUpsell(page)
    await randomDelay(1500, 2500)

    // Xác nhận THẬT (không còn coi "composer đóng" là thành công):
    //  1) Bắt được post_id mới từ response tạo bài → chắc chắn đã đăng. Response tạo bài
    //     có thể về chậm vài giây → POLL tới 20s thay vì check 1 lần (trước đây chính vì
    //     check 1 lần quá sớm nên lần đầu hay "fail" rồi mới đậu ở lần retry). Ưu tiên URL
    //     đã khớp nội dung (capturedLocked); chưa khớp thì chờ hết hạn rồi mới dùng best-effort.
    const captureDeadline = Date.now() + 20_000
    while (Date.now() < captureDeadline) {
      if (capturedLocked && capturedUrl) break
      await randomDelay(700, 1100)
    }
    if (capturedUrl) {
      return { success: true, postUrl: capturedUrl, timestamp: new Date() }
    }
    //  2) Nếu chưa, reload Trang tìm đúng nội dung vừa đăng (ground-truth, có retry).
    const verified = await verifyPostOnPage(page, navUrl, textNeedles)
    if (verified) {
      return { success: true, timestamp: new Date() }
    }
    return {
      success: false,
      error: 'Không xác nhận được bài sau khi bấm Đăng (không có post_id mới và không thấy bài trên Trang) — FB có thể đã chặn hoặc đổi luồng đăng',
      timestamp: new Date(),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Facebook DOM post failed: ${msg}`, timestamp: new Date() }
  } finally {
    if (context) await persistCookies(context, opts.onCookies)
    await browser.close()
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

// permalink.php?story_fbid=X&id=Y → /Y/posts/X (đồng bộ với normalizePostUrl ở comments.ts)
function normalizePostUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.pathname === '/permalink.php') {
      const s = u.searchParams.get('story_fbid')
      const id = u.searchParams.get('id')
      if (s && id) return `https://www.facebook.com/${id}/posts/${s}`
    }
    return url
  } catch {
    return url
  }
}

/**
 * Trả lời 1 comment trên Facebook bằng browser thật (Playwright DOM) — thay cho
 * createComment (HTTP replay). Mở bài → tìm comment theo nội dung → bấm "Phản hồi"/
 * "Trả lời" → gõ → Enter. Giữ phiên trong browser thật, bền hơn HTTP replay.
 *
 * Định vị comment bằng đoạn text (không dùng feedback_id) vì DOM không expose id đó.
 */
export async function replyToCommentViaDOM(
  cookies: CookieData[],
  userAgent: string,
  postUrl: string,
  commentText: string,
  replyText: string,
  opts: { dryRun?: boolean; onCookies?: CookieSink } = {}
): Promise<AutomationResult> {
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  })
  let context: BrowserContext | undefined

  try {
    context = await browser.newContext({
      userAgent,
      locale: 'vi-VN',
      viewport: { width: 1366, height: 768 },
      extraHTTPHeaders: { 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8' },
    })
    await context.addCookies(cookiesToPlaywright(cookies))
    const page = await context.newPage()

    await page.goto(normalizePostUrl(postUrl), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    if (isLoggedOutUrl(page.url())) {
      return { success: false, error: `Session Facebook không hợp lệ — redirect tới ${page.url()}`, timestamp: new Date() }
    }
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => null)
    await randomDelay(2000, 4000)

    // Cuộn NHẸ để khu vực comment lazy-load — KHÔNG cuộn quá đà, vì FB virtualize
    // (bỏ comment khỏi DOM) khi cuộn vượt qua, làm comment gần đầu bài biến mất.
    for (let i = 0; i < 2; i++) {
      await page.evaluate('window.scrollBy(0, 600)').catch(() => null)
      await randomDelay(1500, 2500)
    }

    // FB render mỗi comment 2 bản (1 visible + 1 ẩn) → BẮT BUỘC lấy bản :visible.
    // waitFor tự retry query liên tục (chống flaky load trễ) mà không overshoot scroll.
    // Khớp theo phần chữ (bỏ emoji) vì emoji là <img> không có trong textContent.
    // Nếu bỏ hết còn rỗng (comment emoji-only) thì fallback về text gốc — best effort.
    const textOnly = stripEmoji(commentText)
    const snippet = (textOnly || commentText.trim()).slice(0, 50)
    const commentNode = page.locator('div[role="article"]:visible').filter({ hasText: snippet }).first()
    try {
      await commentNode.waitFor({ state: 'visible', timeout: 25_000 })
    } catch {
      return { success: false, error: `Không tìm thấy comment cần trả lời (text: "${snippet}")`, timestamp: new Date() }
    }
    await commentNode.scrollIntoViewIfNeeded().catch(() => null)
    await randomDelay(500, 1000)

    // Nút "Phản hồi"/"Trả lời" trong comment đó
    const replyBtn = commentNode
      .locator('div[role="button"], span[role="button"]')
      .filter({ hasText: /^Phản hồi$|^Trả lời$|^Reply$/i })
      .first()
    await replyBtn.click({ timeout: 10_000 })
    await randomDelay(800, 1500)

    // Ô soạn PHẢN HỒI có aria-label "Trả lời <tên>" — KHÔNG nhầm với ô comment chính
    // ("Bình luận dưới tên ...") cũng đang visible, nếu nhầm sẽ thành comment top-level.
    const box = page
      .locator(
        '[role="textbox"][contenteditable="true"][aria-label*="Trả lời"]:visible, ' +
        '[role="textbox"][contenteditable="true"][aria-label*="Phản hồi"]:visible, ' +
        '[role="textbox"][contenteditable="true"][aria-label*="Reply"]:visible'
      )
      .first()
    await box.waitFor({ state: 'visible', timeout: 15_000 })
    await box.click({ force: true })
    await randomDelay(300, 700)
    await page.keyboard.type(replyText, { delay: 20 + Math.random() * 40 })
    await randomDelay(600, 1200)

    if (opts.dryRun) {
      console.log('[Facebook:DOM] DRY-RUN reply — đã tìm thấy comment, mở ô & gõ xong, KHÔNG nhấn Enter')
      await randomDelay(1000, 2000)
      return { success: true, timestamp: new Date() }
    }

    await page.keyboard.press('Enter')

    // Xác nhận: chờ reply hiện trong thread (hoặc ô soạn đã clear).
    await randomDelay(2500, 4500)
    const replySnippet = replyText.trim().slice(0, 40)
    const appeared = await page.getByText(replySnippet, { exact: false }).count().catch(() => 0)
    if (appeared > 0) {
      return { success: true, timestamp: new Date() }
    }

    // Không thấy text → kiểm tra ô soạn còn nội dung không (chưa gửi được)
    const boxText = await box.innerText().catch(() => '')
    if (boxText.trim().length > 0) {
      return { success: false, error: 'Reply chưa gửi được — ô soạn vẫn còn nội dung', timestamp: new Date() }
    }
    // Ô đã clear nhưng chưa thấy text render — coi như đã gửi (FB render chậm)
    return { success: true, timestamp: new Date() }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Facebook DOM reply failed: ${msg}`, timestamp: new Date() }
  } finally {
    if (context) await persistCookies(context, opts.onCookies)
    await browser.close()
  }
}
