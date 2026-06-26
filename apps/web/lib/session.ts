import { readFile } from 'fs/promises'
import { connectDB } from './db/index'
import { Account } from './db/schema'
import { decrypt, encrypt } from './crypto'
import { DEFAULT_USER_AGENT } from '@automation/core'
import type { CookieData, SessionData, SessionTokens } from '@automation/core'

export async function loadSessionForAccount(accountId: string): Promise<SessionData | null> {
  await connectDB()

  const account = await Account.findById(accountId)
  if (!account) return null

  if (account.encryptedSession) {
    try {
      const json = decrypt(account.encryptedSession)
      return JSON.parse(json) as SessionData
    } catch (err) {
      console.error(`[Session] Failed to decrypt session for account ${accountId}:`, err)
      return null
    }
  }

  if (account.cookiesPath) {
    try {
      const raw = await readFile(account.cookiesPath, 'utf-8')
      return JSON.parse(raw) as SessionData
    } catch {
      return null
    }
  }

  return null
}

// Lưu lại cookie MỚI (FB/X xoay vòng xs/auth_token sau mỗi lần dùng) về DB, thay cho việc
// cứ replay bản cookie đông lạnh từ lúc export → phiên sống lâu hơn, đỡ phải re-export.
// Guard: chỉ ghi khi phiên còn hợp lệ (có cặp auth cookie) và khi token đã thực sự đổi —
// tránh ghi đè DB bằng phiên đã chết và tránh write thừa mỗi lần poll comment.
export async function saveSessionCookies(accountId: string, cookies: CookieData[]): Promise<void> {
  const get = (n: string) => cookies.find((c) => c.name === n)?.value
  const looksValid =
    (get('c_user') && get('xs')) || (get('auth_token') && get('ct0'))
  if (!looksValid) return

  await connectDB()
  const account = await Account.findById(accountId)
  if (!account?.encryptedSession) return

  const session = JSON.parse(decrypt(account.encryptedSession)) as SessionData
  const prev = session.cookies ?? []
  const prevAuth =
    prev.find((c) => c.name === 'xs')?.value ?? prev.find((c) => c.name === 'auth_token')?.value
  const newAuth = get('xs') ?? get('auth_token')
  if (prevAuth && newAuth && prevAuth === newAuth && prev.length === cookies.length) return

  session.cookies = cookies
  session.lastRefreshed = new Date()
  account.encryptedSession = encrypt(JSON.stringify(session))
  await account.save()
  console.log(`[Session] Đã cập nhật cookie xoay vòng cho account ${accountId}`)
}

export async function updateSessionTokens(accountId: string, tokens: SessionTokens): Promise<void> {
  await connectDB()
  const account = await Account.findById(accountId)
  if (!account?.encryptedSession) return

  const session = JSON.parse(decrypt(account.encryptedSession)) as SessionData
  session.tokens = tokens
  account.encryptedSession = encrypt(JSON.stringify(session))
  await account.save()
}

export interface ParsedCookieInput {
  name: string
  value: string
  domain: string
  path: string
  expirationDate?: number
  httpOnly?: boolean
  secure?: boolean
}

export function parseCookieInput(raw: string, userAgent?: string): SessionData {
  const cookies = JSON.parse(raw) as ParsedCookieInput[]

  if (!Array.isArray(cookies) || cookies.length === 0) {
    throw new Error('Cookie JSON phải là một array không rỗng')
  }

  const first = cookies[0]
  if (!first.name || !first.value || !first.domain) {
    throw new Error('Mỗi cookie cần có name, value, domain')
  }

  // Facebook: userId từ c_user; Twitter: userId từ twid (u%3D1234567890)
  const cUid = cookies.find((c) => c.name === 'c_user')
  const twid = cookies.find((c) => c.name === 'twid')
  const userId = cUid?.value ?? (twid ? decodeURIComponent(twid.value).replace('u=', '') : '')

  return {
    userId,
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path ?? '/',
      expires: c.expirationDate ? Math.floor(c.expirationDate) : undefined,
      httpOnly: c.httpOnly ?? false,
      secure: c.secure ?? true,
    })),
    userAgent: userAgent || DEFAULT_USER_AGENT,
    lastRefreshed: new Date(),
  }
}
