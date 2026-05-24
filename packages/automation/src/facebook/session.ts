import { readFile, writeFile } from 'fs/promises'
import type { SessionData } from '../types.js'

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
