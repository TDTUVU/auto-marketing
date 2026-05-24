import { chromium } from 'playwright'
import type { AutomationResult, CookieData, PostPayload } from '../types.js'

// Fallback khi graphql.ts không hoạt động (Facebook thay đổi request format)
export async function postViaDOM(
  cookies: CookieData[],
  userAgent: string,
  payload: PostPayload
): Promise<AutomationResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  })

  const context = await browser.newContext({
    userAgent,
    // Stealth: xóa dấu hiệu automation
    extraHTTPHeaders: { 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8' },
  })

  await context.addCookies(
    cookies.map((c) => ({
      ...c,
      domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
      expires: c.expires ?? -1,
    }))
  )

  const page = await context.newPage()

  try {
    await page.goto('https://www.facebook.com', { waitUntil: 'networkidle' })

    // Click vào ô tạo bài đăng
    await page.click('[aria-label="Bạn đang nghĩ gì?"], [placeholder="Bạn đang nghĩ gì?"]')
    await page.waitForTimeout(1000 + Math.random() * 1000)

    // Nhập nội dung
    await page.keyboard.type(payload.text, { delay: 50 + Math.random() * 50 })
    await page.waitForTimeout(1500 + Math.random() * 1000)

    // TODO: upload ảnh nếu có imageUrls

    // Click đăng
    await page.click('[aria-label="Đăng"], button:has-text("Đăng")')
    await page.waitForTimeout(3000)

    return { success: true, timestamp: new Date() }
  } catch (err) {
    return { success: false, error: String(err), timestamp: new Date() }
  } finally {
    await browser.close()
  }
}
