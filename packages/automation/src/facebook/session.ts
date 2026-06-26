import { readFile, writeFile } from 'fs/promises'
import type { BrowserContext } from 'playwright'
import type { CookieData, SessionData } from '../types.js'

// Callback để caller (worker) lưu lại cookie MỚI sau mỗi lần chạy browser — FB/X xoay vòng
// token phiên (xs/auth_token...) liên tục; nếu cứ replay bản cookie đông lạnh thì phiên mau
// chết. Đọc cookie hiện tại của context rồi lưu DB → phiên sống lâu hơn nhiều.
export type CookieSink = (cookies: CookieData[]) => void | Promise<void>

export async function readContextCookies(context: BrowserContext): Promise<CookieData[]> {
  const cs = await context.cookies()
  return cs.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    ...(typeof c.expires === 'number' && c.expires > 0 ? { expires: Math.floor(c.expires) } : {}),
    httpOnly: c.httpOnly,
    secure: c.secure,
  }))
}

// Gọi sink an toàn (không để lỗi lưu cookie làm hỏng kết quả đăng/đọc). Bỏ qua nếu không có sink.
export async function persistCookies(
  context: BrowserContext,
  sink: CookieSink | undefined
): Promise<void> {
  if (!sink) return
  try {
    await sink(await readContextCookies(context))
  } catch (err) {
    console.error('[Session] Lưu cookie xoay vòng thất bại:', err instanceof Error ? err.message : err)
  }
}

// User-Agent bắt được từ Firefox 151 — giữ đồng bộ với browser thật
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:151.0) Gecko/20100101 Firefox/151.0'

const SESSIONS_DIR = 'sessions'

export async function loadSession(accountId: string): Promise<SessionData | null> {
  try {
    const raw = await readFile(`${SESSIONS_DIR}/${accountId}.json`, 'utf-8')
    return JSON.parse(raw) as SessionData
  } catch {
    return null
  }
}

export async function saveSession(accountId: string, session: SessionData): Promise<void> {
  await writeFile(
    `${SESSIONS_DIR}/${accountId}.json`,
    JSON.stringify(session, null, 2),
    'utf-8'
  )
}
