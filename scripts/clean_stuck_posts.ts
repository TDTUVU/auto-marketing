/**
 * Dọn bài đăng kẹt ở trạng thái `scheduled` — bài đã quá giờ đăng từ lâu nhưng
 * worker chưa bao giờ publish (thường do worker chết lúc đó). Bài kẹt còn làm
 * "rò rỉ" quota autopilot (postsPerDay) nên cần đổi sang `failed`.
 *
 * Mặc định chạy DRY-RUN (chỉ liệt kê). Thêm `--apply` để thực sự cập nhật.
 * Ngưỡng "kẹt" mặc định 30 phút, đổi bằng `--minutes=N`.
 *
 * Chạy:
 *   tsx --env-file=.env scripts/clean_stuck_posts.ts            # xem trước
 *   tsx --env-file=.env scripts/clean_stuck_posts.ts --apply    # áp dụng
 *   tsx --env-file=.env scripts/clean_stuck_posts.ts --apply --minutes=60
 */

import dns from 'dns'
dns.setServers(['8.8.8.8', '1.1.1.1']) // router nhà chặn DNS SRV → ép resolver công cộng

import mongoose from 'mongoose'
import { Post, Account } from '../apps/web/lib/db/schema'

const MONGODB_URI = process.env['MONGODB_URI'] ?? ''
if (!MONGODB_URI) throw new Error('MONGODB_URI is not set')

const APPLY = process.argv.includes('--apply')
const minutesArg = process.argv.find((a) => a.startsWith('--minutes='))
const STUCK_MINUTES = minutesArg ? Number(minutesArg.split('=')[1]) : 30

async function main() {
  await mongoose.connect(MONGODB_URI)

  const now = new Date()
  const cutoff = new Date(now.getTime() - STUCK_MINUTES * 60 * 1000)

  // Bài kẹt = status 'scheduled' và đáng lẽ đã phải đăng (scheduledAt, fallback
  // createdAt) trước mốc cutoff. Không đụng bài hẹn giờ trong tương lai.
  const stuck = await Post.find({
    status: 'scheduled',
    $or: [
      { scheduledAt: { $lt: cutoff } },
      { scheduledAt: { $exists: false }, createdAt: { $lt: cutoff } },
      { scheduledAt: null, createdAt: { $lt: cutoff } },
    ],
  })
    .select('accountId content scheduledAt createdAt')
    .sort({ createdAt: 1 })
    .lean()

  const accIds = [...new Set(stuck.map((p) => p.accountId.toString()))]
  const accounts = await Account.find({ _id: { $in: accIds } }).select('name platform').lean()
  const accMap = new Map(accounts.map((a) => [a._id.toString(), a]))

  console.log(`Mốc kẹt: scheduled & quá hạn > ${STUCK_MINUTES} phút (trước ${cutoff.toISOString()})`)
  console.log(`Tìm thấy ${stuck.length} bài kẹt:\n`)

  for (const p of stuck) {
    const acc = accMap.get(p.accountId.toString())
    const when = (p.scheduledAt ?? p.createdAt)?.toISOString?.() ?? '-'
    const label = acc ? `${acc.name} (${acc.platform})` : p.accountId.toString()
    console.log(`  [${when}] ${label} — "${(p.content || '').slice(0, 55).replace(/\n/g, ' ')}"`)
  }

  if (stuck.length === 0) {
    console.log('\nKhông có bài nào để dọn.')
    await mongoose.disconnect()
    return
  }

  if (!APPLY) {
    console.log('\nDRY-RUN — chưa thay đổi gì. Thêm --apply để đổi các bài trên sang "failed".')
    await mongoose.disconnect()
    return
  }

  const ids = stuck.map((p) => p._id)
  const res = await Post.updateMany(
    { _id: { $in: ids } },
    { $set: { status: 'failed', errorMessage: `Stuck in scheduled > ${STUCK_MINUTES}m — cleaned by clean_stuck_posts` } }
  )
  console.log(`\nĐã đổi ${res.modifiedCount} bài sang "failed".`)
  await mongoose.disconnect()
}

main().catch((err) => { console.error(err); process.exit(1) })
