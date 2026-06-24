import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { AutomationResult, CookieData, PostPayload } from '../types.js'
import { extractTweetUrl } from './api.js'
import { extractTweetId, extractReplies, type TwitterReplyData } from './comments.js'

// KHÔNG import playwright-extra/stealth ở top-level: Next bundle web sẽ evaluate
// stealth lúc build → lỗi "n.typeOf is not a function". Load động + register 1 lần.
// (Cùng lý do với twitter/metrics.ts.)
let _stealthReady = false
async function getStealthChromium() {
  const { chromium } = await import('playwright-extra')
  if (!_stealthReady) {
    const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default
    chromium.use(StealthPlugin())
    _stealthReady = true
  }
  return chromium
}

// Mặc định headless. Nếu X vẫn challenge "looks automated", đặt TWITTER_HEADLESS=false
// để chạy browser thật có giao diện — khó bị phát hiện hơn nhiều.
const HEADLESS = process.env['TWITTER_HEADLESS'] !== 'false'

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Cookie X sống ở .x.com (một số legacy ở .twitter.com) — normalize domain.
function toPlaywrightCookies(cookies: CookieData[]) {
  return cookies
    .filter((c) => c.domain.includes('x.com') || c.domain.includes('twitter.com'))
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
      path: c.path || '/',
      expires: c.expires ?? -1,
      httpOnly: c.httpOnly ?? false,
      secure: c.secure ?? true,
    }))
}

// Mở browser thật + nạp cookie session X. Dùng chung cho post / reply / đọc replies.
async function launchX(cookies: CookieData[], userAgent: string) {
  const chromium = await getStealthChromium()
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  })
  const context = await browser.newContext({
    userAgent,
    locale: 'vi-VN',
    viewport: { width: 1366, height: 768 },
    extraHTTPHeaders: { 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8' },
  })
  await context.addCookies(toPlaywrightCookies(cookies))
  const page = await context.newPage()
  return { browser, page }
}

// Khớp request CreateTweet (cả đăng bài lẫn reply đều đi qua endpoint này).
const isCreateTweet = (r: { url(): string; request(): { method(): string } }) =>
  r.url().includes('/CreateTweet') && r.request().method() === 'POST'

function isLoggedOutUrl(url: string): boolean {
  return url.includes('/login') || url.includes('/i/flow') || url.includes('/account/access')
}

/**
 * Đăng tweet qua DOM automation bằng browser thật.
 *
 * Khác với api.ts (HTTP request replay), cách này để chính client web của X
 * tự sinh header chống bot `x-client-transaction-id` — nên tránh được lỗi
 * "this request looks like it might be automated".
 */
export async function postToTwitterViaDOM(
  cookies: CookieData[],
  userAgent: string,
  payload: PostPayload
): Promise<AutomationResult> {
  const { browser, page } = await launchX(cookies, userAgent)
  let tmpDir: string | undefined

  try {
    // Mở thẳng composer modal — đỡ phải click qua trang home
    await page.goto('https://x.com/compose/post', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    await randomDelay(1500, 3000)

    // Session hỏng → X đẩy sang login/flow
    const url = page.url()
    if (isLoggedOutUrl(url)) {
      return {
        success: false,
        error: `Session Twitter không hợp lệ — bị redirect tới ${url}`,
        timestamp: new Date(),
      }
    }

    // /compose/post render modal ĐÈ lên home timeline → có cả ô soạn của home.
    // Scope mọi thao tác vào trong modal dialog để tránh strict-mode (2 elements).
    const dialog = page.locator('[aria-modal="true"][role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 30_000 })

    // Ô soạn tweet (trong modal)
    const editor = dialog.locator('[data-testid="tweetTextarea_0"]')
    await editor.waitFor({ state: 'visible', timeout: 30_000 })
    await editor.click()
    await randomDelay(400, 900)

    // Gõ từng ký tự cho giống người thật
    await page.keyboard.type(payload.text, { delay: 30 + Math.random() * 40 })
    await randomDelay(800, 1600)

    // Upload ảnh (nếu có) qua input file ẩn
    if (payload.photos?.length) {
      tmpDir = await mkdtemp(join(tmpdir(), 'x-upload-'))
      const paths: string[] = []
      for (let i = 0; i < payload.photos.length; i++) {
        const photo = payload.photos[i]!
        const fp = join(tmpDir, photo.filename || `image-${i}.jpg`)
        await writeFile(fp, photo.buffer)
        paths.push(fp)
      }
      const fileInput = dialog.locator('[data-testid="fileInput"]')
      await fileInput.setInputFiles(paths)
      console.log(`[Twitter:DOM] uploading ${paths.length} photo(s)...`)
      // Chờ X xử lý xong ảnh — nút đăng bị disable tới khi upload hoàn tất
    }

    // Chờ ảnh upload xong & nút đăng sẵn sàng (không còn aria-disabled)
    const postButtonSel =
      '[aria-modal="true"] [data-testid="tweetButton"]:not([aria-disabled="true"])'
    await page.waitForSelector(postButtonSel, { timeout: 60_000 })
    await randomDelay(600, 1400)

    // Submit bằng Ctrl+Enter — X hỗ trợ sẵn shortcut này, né lỗi actionability
    // của nút đăng (nút hay bị toggle aria-disabled khi X re-render).
    const primaryWait = page.waitForResponse(isCreateTweet, { timeout: 20_000 }).catch(() => null)
    await editor.click()
    await randomDelay(200, 500)
    await page.keyboard.press('Control+Enter')

    let response = await primaryWait

    // Fallback: shortcut không ăn → click nút đăng (bỏ qua actionability bằng force)
    if (!response) {
      console.log('[Twitter:DOM] Ctrl+Enter không ăn — fallback click nút đăng')
      const retryWait = page.waitForResponse(isCreateTweet, { timeout: 25_000 }).catch(() => null)
      await dialog
        .locator('[data-testid="tweetButton"]')
        .click({ force: true, timeout: 10_000 })
        .catch(() => {})
      response = await retryWait
    }

    let postUrl: string | undefined

    if (response) {
      try {
        const json = (await response.json()) as Record<string, unknown>
        const errors = json['errors'] as Array<{ message: string }> | undefined
        postUrl = extractTweetUrl(json)
        if (!postUrl && errors?.length) {
          return {
            success: false,
            error: errors.map((e) => e.message).join('; '),
            timestamp: new Date(),
          }
        }
      } catch {
        /* parse lỗi — rơi xuống kiểm tra composer bên dưới */
      }
    }

    // Chờ composer đóng (dấu hiệu đăng thành công)
    await randomDelay(2500, 4000)

    if (!postUrl) {
      const stillOpen = await editor.isVisible().catch(() => false)
      if (stillOpen) {
        return {
          success: false,
          error:
            'Composer chưa đóng sau khi bấm đăng — X có thể đã chặn (challenge automation / giới hạn tài khoản)',
          timestamp: new Date(),
        }
      }
    }

    const result: AutomationResult = { success: true, timestamp: new Date() }
    if (postUrl) result.postUrl = postUrl
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Twitter DOM post failed: ${msg}`, timestamp: new Date() }
  } finally {
    await browser.close()
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Đọc các reply của 1 tweet bằng browser thật.
 *
 * Mở trang tweet → intercept response GraphQL `TweetDetail` mà chính client X gọi
 * (kèm x-client-transaction-id hợp lệ) → parse bằng extractReplies (dùng chung với
 * bản HTTP cũ). Thay cho fetchTweetReplies (HTTP replay dễ bị chặn).
 */
export async function fetchTweetRepliesViaDOM(
  cookies: CookieData[],
  userAgent: string,
  tweetUrl: string,
  ownerId: string
): Promise<TwitterReplyData[]> {
  const tweetId = extractTweetId(tweetUrl)
  if (!tweetId) throw new Error(`Cannot extract tweet ID from URL: ${tweetUrl}`)

  const navUrl = `https://x.com/i/web/status/${tweetId}`
  const { browser, page } = await launchX(cookies, userAgent)
  const out: TwitterReplyData[] = []

  // Intercept mọi response GraphQL — TweetDetail chứa cây hội thoại (replies).
  page.on('response', (response) => {
    if (!response.url().includes('graphql')) return
    response
      .text()
      .then((raw) => {
        try {
          const json = JSON.parse(raw) as Record<string, unknown>
          extractReplies(json, tweetId, ownerId, out)
        } catch {
          /* response không phải JSON — bỏ qua */
        }
      })
      .catch(() => {})
  })

  try {
    await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    if (isLoggedOutUrl(page.url())) {
      throw new Error(`Session Twitter không hợp lệ — bị redirect tới ${page.url()}`)
    }

    // Chờ tweet render (xác nhận X đã trả nội dung)
    try {
      await page.waitForSelector('article[data-testid="tweet"]', { timeout: 20_000 })
    } catch {
      /* không có article — có thể bị chặn, vẫn để intercept thử bên dưới */
    }

    // Cho TweetDetail kịp về (replies có thể tải sau khi DOM ready)
    for (let i = 0; i < 12 && out.length === 0; i++) {
      await page.waitForTimeout(1000)
    }

    console.log(`[Twitter:DOM] tweet ${tweetId} — đọc được ${out.length} reply`)
    return out
  } finally {
    await browser.close()
  }
}

/**
 * Reply vào 1 tweet/comment bằng browser thật.
 *
 * Mở trang status của comment cần reply → bấm nút Reply để bật modal soạn →
 * gõ + Ctrl+Enter (giống postToTwitterViaDOM). Để client X tự sinh
 * x-client-transaction-id, thay cho replyToTweet (HTTP replay).
 */
export async function replyToTweetViaDOM(
  cookies: CookieData[],
  userAgent: string,
  parentTweetId: string,
  replyText: string
): Promise<AutomationResult> {
  const { browser, page } = await launchX(cookies, userAgent)

  try {
    await page.goto(`https://x.com/i/web/status/${parentTweetId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    await randomDelay(1500, 3000)

    if (isLoggedOutUrl(page.url())) {
      return {
        success: false,
        error: `Session Twitter không hợp lệ — bị redirect tới ${page.url()}`,
        timestamp: new Date(),
      }
    }

    // Tweet gốc (focal) render đầu tiên → nút reply đầu tiên là của nó.
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 30_000 })
    await page.locator('[data-testid="reply"]').first().click()

    // Modal soạn reply — cùng cấu trúc với composer đăng bài.
    const dialog = page.locator('[aria-modal="true"][role="dialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 30_000 })

    const editor = dialog.locator('[data-testid="tweetTextarea_0"]')
    await editor.waitFor({ state: 'visible', timeout: 30_000 })
    await editor.click()
    await randomDelay(400, 900)

    await page.keyboard.type(replyText, { delay: 30 + Math.random() * 40 })
    await randomDelay(800, 1600)

    await page.waitForSelector(
      '[aria-modal="true"] [data-testid="tweetButton"]:not([aria-disabled="true"])',
      { timeout: 30_000 }
    )
    await randomDelay(600, 1400)

    // Submit bằng Ctrl+Enter, fallback click nút đăng (giống post)
    const primaryWait = page.waitForResponse(isCreateTweet, { timeout: 20_000 }).catch(() => null)
    await editor.click()
    await randomDelay(200, 500)
    await page.keyboard.press('Control+Enter')

    let response = await primaryWait
    if (!response) {
      console.log('[Twitter:DOM] reply: Ctrl+Enter không ăn — fallback click nút đăng')
      const retryWait = page.waitForResponse(isCreateTweet, { timeout: 25_000 }).catch(() => null)
      await dialog
        .locator('[data-testid="tweetButton"]')
        .click({ force: true, timeout: 10_000 })
        .catch(() => {})
      response = await retryWait
    }

    if (response) {
      try {
        const json = (await response.json()) as Record<string, unknown>
        const errors = json['errors'] as Array<{ message: string }> | undefined
        const repliedUrl = extractTweetUrl(json)
        if (!repliedUrl && errors?.length) {
          return { success: false, error: errors.map((e) => e.message).join('; '), timestamp: new Date() }
        }
        if (repliedUrl) {
          const result: AutomationResult = { success: true, timestamp: new Date() }
          result.postUrl = repliedUrl
          return result
        }
      } catch {
        /* parse lỗi — rơi xuống kiểm tra modal bên dưới */
      }
    }

    // Không bắt được response/URL → kiểm tra modal đã đóng chưa
    await randomDelay(2500, 4000)
    const stillOpen = await editor.isVisible().catch(() => false)
    if (stillOpen) {
      return {
        success: false,
        error: 'Modal reply chưa đóng sau khi gửi — X có thể đã chặn (challenge / giới hạn)',
        timestamp: new Date(),
      }
    }

    return { success: true, timestamp: new Date() }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Twitter DOM reply failed: ${msg}`, timestamp: new Date() }
  } finally {
    await browser.close()
  }
}
