/**
 * Test end-to-end: load session → fetch tokens → post to Facebook
 *
 * Chạy:  pnpm test:post
 *   hoặc: pnpm test:post --account myshop --message "Nội dung bài đăng"
 *
 * Mặc định dùng --dry-run (không đăng thật) — thêm --post để đăng thật.
 */

import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchFbTokens, postToFacebook, tokensFromSession } from '../packages/automation/src/facebook/graphql.js'
import type { SessionData } from '../packages/automation/src/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SESSIONS_DIR = path.join(__dirname, '..', 'sessions')

// ── Parse args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const getArg = (flag: string, fallback = '') => {
  const idx = args.indexOf(flag)
  return idx !== -1 ? (args[idx + 1] ?? fallback) : fallback
}

const accountId = getArg('--account', 'default')
const message = getArg('--message', `Test tự động ${new Date().toLocaleString('vi-VN')}`)
const dryRun = !args.includes('--post')
const debug = args.includes('--debug')

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n=== Facebook Post Test ===')
  console.log(`Account  : ${accountId}`)
  console.log(`Message  : ${message}`)
  console.log(`Dry run  : ${dryRun ? 'YES (thêm --post để đăng thật)' : 'NO — SẼ ĐĂNG THẬT'}`)
  console.log('')

  // 1. Load session
  console.log('[1] Loading session...')
  const sessionPath = path.join(SESSIONS_DIR, `${accountId}.json`)
  let session: SessionData
  try {
    const raw = await readFile(sessionPath, 'utf-8')
    session = JSON.parse(raw) as SessionData
    console.log(`    ✓ User ID : ${session.userId}`)
    console.log(`    ✓ Cookies : ${session.cookies.length}`)
    console.log(`    ✓ Exported: ${session.lastRefreshed}`)
  } catch {
    console.error(`    ✗ Không tìm thấy session: ${sessionPath}`)
    console.error(`      Chạy: python scripts/export_cookies.py --account ${accountId}`)
    process.exit(1)
  }

  // 2. Lấy tokens — ưu tiên từ session file, fallback fetch từ Facebook
  console.log('\n[2] Loading FB tokens...')
  let tokens
  if (session.tokens?.fb_dtsg) {
    tokens = tokensFromSession(session.userId, session.tokens)
    console.log(`    ✓ Source  : session file`)
    console.log(`    ✓ fb_dtsg : ${tokens.fbDtsg.slice(0, 20)}...`)
    console.log(`    ✓ lsd     : ${tokens.lsd}`)
    console.log(`    ✓ rev     : ${tokens.rev}`)
  } else {
    console.log('    ~ Không có tokens trong file, đang fetch từ Facebook...')
    try {
      tokens = await fetchFbTokens(session.cookies, session.userAgent, debug)
      console.log(`    ✓ fb_dtsg : ${tokens.fbDtsg.slice(0, 20)}...`)
    } catch (err) {
      console.error(`    ✗ Lỗi fetch tokens: ${err}`)
      console.error('      Chạy lại: python scripts/export_cookies.py --account ' + accountId)
      process.exit(1)
    }
  }

  // 3. Dry run — chỉ kiểm tra tokens, không đăng
  if (dryRun) {
    console.log('\n[3] Dry run — tokens OK, bỏ qua bước đăng bài.')
    console.log('\n✓ Sẵn sàng đăng bài. Chạy với --post để đăng thật:')
    console.log(`  pnpm test:post --account ${accountId} --message "Nội dung" --post`)
    return
  }

  // 4. Đăng bài thật
  console.log('\n[3] Posting to Facebook...')
  const result = await postToFacebook(session.cookies, session.userAgent, tokens, {
    text: message,
  })

  if (result.success) {
    console.log('    ✓ Đăng bài thành công!')
    console.log(`    ✓ Timestamp: ${result.timestamp.toISOString()}`)
  } else {
    console.error(`    ✗ Thất bại: ${result.error}`)
    process.exit(1)
  }
}

function shutdown(code: number): void {
  // Force exit — undici giữ open connections trên Node 23/Windows gây crash khi graceful exit
  process.exitCode = code
  setImmediate(() => process.exit(code))
}

main()
  .then(() => shutdown(0))
  .catch((err: unknown) => {
    console.error('\n[!] Unexpected error:', err)
    shutdown(1)
  })
