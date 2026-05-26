import { readFile } from 'fs/promises'
import { connectDB } from './db/index'
import { Account } from './db/schema'
import { decrypt } from './crypto'
import { DEFAULT_USER_AGENT } from '@automation/core'
import type { SessionData } from '@automation/core'

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

  const cUid = cookies.find((c) => c.name === 'c_user')
  const userId = cUid?.value ?? ''

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
