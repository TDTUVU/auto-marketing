import { chromium } from 'playwright'
import type { CookieData, SessionData } from '../types.js'

/** Chỉ số 1 bài Page đọc từ bảng Meta Business Suite → Insights → Nội dung. */
export interface FacebookPageInsightEntry {
  /** Tiêu đề bài trong bảng (có thể bị cắt "…" ở cuối). */
  title: string
  /** Text ngày đăng trong bảng, vd "17 Tháng 6 22:15". */
  dateText: string
  views?: number
  reach?: number
  reactions?: number
  comments?: number
  shares?: number
  saves?: number
}

const ZW = /[​-‍﻿]/g

/** "29" / "1.234" / "1,2 N" / "1,2K" / "--" / "" → số nguyên hoặc undefined. */
function parseCell(v: string): number | undefined {
  const s = v.replace(ZW, '').trim()
  if (!s || s === '--' || s === '—') return undefined
  // VN: "." ngăn nghìn, "," thập phân.
  const cleaned = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const m = cleaned.match(/([\d.]+)\s*([KMNkmn]|Tr|tr)?/)
  if (!m?.[1]) return undefined
  let n = parseFloat(m[1])
  if (!Number.isFinite(n)) return undefined
  const suffix = (m[2] ?? '').toUpperCase()
  if (suffix === 'K' || suffix === 'N') n *= 1_000
  else if (suffix === 'M' || suffix === 'TR') n *= 1_000_000
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
    secure: c.secure ?? false,
    sameSite: 'Lax' as const,
  }))
}

// Nhãn header (sau khi strip zero-width) → khóa metric. Khớp CHÍNH XÁC để tránh
// nhầm "Lượt xem" với "Người xem" / "Lượt xem trong tối thiểu 3 giây" / "Thời gian xem".
const HEADER_MAP: Record<string, keyof FacebookPageInsightEntry> = {
  'Lượt xem': 'views',
  'Số người tiếp cận': 'reach',
  'Lượt thích và cảm xúc': 'reactions',
  'Bình luận': 'comments',
  'Lượt chia sẻ': 'shares',
  'Lượt lưu': 'saves',
}

interface RawTable {
  /** index cột → text (header). */
  headers: string[]
  /** mỗi hàng = mảng text theo cột. */
  rows: string[][]
}

/**
 * Đọc per-post insights (views/reach/...) của 1 Page bằng cách scrape bảng
 * Business Suite → Insights → Nội dung. Bảng này render mọi chỉ số theo cột,
 * là nguồn DUY NHẤT có `views` cho bài text/ảnh thường (không chỉ video) và
 * lấy được TẤT CẢ bài của page trong 1 lần tải (scale theo page).
 *
 * Chỉ áp dụng cho Page (cần `pageId` = asset_id). Profile cá nhân không có.
 */
export async function fetchFacebookPageInsights(
  session: SessionData,
  pageId: string
): Promise<FacebookPageInsightEntry[]> {
  const url = `https://business.facebook.com/latest/insights/content?asset_id=${pageId}`
  console.log(`[Facebook:insights] mở bảng Business Suite cho page ${pageId}`)

  const headless = process.env['METRICS_HEADLESS'] !== 'false'
  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  })
  const context = await browser.newContext({
    userAgent: session.userAgent,
    extraHTTPHeaders: { 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8' },
    viewport: { width: 1600, height: 950 },
  })
  await context.addCookies(cookiesToPlaywright(session.cookies))
  const page = await context.newPage()

  // Đọc header + các hàng đang render trong grid.
  const readTable = `(() => {
    const grid = document.querySelector('[role="grid"]')
    if (!grid) return { headers: [], rows: [] }
    const headers = [...grid.querySelectorAll('[role="columnheader"]')]
      .map((h) => (h.textContent || '').trim())
    const rows = []
    grid.querySelectorAll('[role="row"]').forEach((row) => {
      const cells = [...row.querySelectorAll('[role="gridcell"]')]
      if (cells.length === 0) return
      rows.push(cells.map((c) => (c.textContent || '').replace(/\\s+/g, ' ').trim()))
    })
    return { headers, rows }
  })()`

  // Scroll xuống để nạp thêm hàng (bảng ảo hoá). Cuộn MỌI container cuộn được
  // (Business Suite dùng div nội bộ) + window, theo từng bước để virtualizer kịp render.
  const scrollGrid = `(() => {
    document.querySelectorAll('*').forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 50) el.scrollTop += el.clientHeight
    })
    window.scrollBy(0, 600)
  })()`

  const byKey = new Map<string, string[]>()
  let headers: string[] = []

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    // Chờ grid xuất hiện với ít nhất 1 hàng dữ liệu.
    let ready = false
    for (let i = 0; i < 25 && !ready; i++) {
      await page.waitForTimeout(1500)
      const t = (await page.evaluate(readTable)) as RawTable
      if (t.headers.length > 0 && t.rows.length > 0) {
        headers = t.headers
        ready = true
      }
    }
    if (!ready) {
      console.log('[Facebook:insights] KHÔNG thấy bảng grid')
      return []
    }

    // Gom hàng qua nhiều lần scroll tới khi số hàng ổn định (không tăng nữa).
    let stable = 0
    for (let i = 0; i < 60 && stable < 5; i++) {
      const t = (await page.evaluate(readTable)) as RawTable
      if (t.headers.length > 0) headers = t.headers
      const before = byKey.size
      for (const cells of t.rows) {
        const key = `${cells[0] ?? ''}|${cells[1] ?? ''}`
        if (key.trim() && !byKey.has(key)) byKey.set(key, cells)
      }
      stable = byKey.size === before ? stable + 1 : 0
      await page.evaluate(scrollGrid).catch(() => {})
      await page.waitForTimeout(900)
    }
  } finally {
    await browser.close()
  }

  // Map index cột theo nhãn header.
  const colIndex: Partial<Record<keyof FacebookPageInsightEntry, number>> = {}
  headers.forEach((h, i) => {
    const clean = h.replace(ZW, '').trim()
    const key = HEADER_MAP[clean]
    if (key) colIndex[key] = i
  })

  const entries: FacebookPageInsightEntry[] = []
  for (const cells of byKey.values()) {
    const title = cells[0] ?? ''
    const dateText = cells[1] ?? ''
    if (!title) continue
    const entry: FacebookPageInsightEntry = { title, dateText }
    for (const k of ['views', 'reach', 'reactions', 'comments', 'shares', 'saves'] as const) {
      const idx = colIndex[k]
      if (idx != null) {
        const n = parseCell(cells[idx] ?? '')
        if (n != null) entry[k] = n
      }
    }
    entries.push(entry)
  }

  console.log(`[Facebook:insights] đọc ${entries.length} bài từ bảng (cột: ${Object.keys(colIndex).join(',')})`)
  return entries
}
