/**
 * Dọn các log "Reply failed" trong AutomationLog (cũng là nguồn hiển thị trên web UI).
 *
 * Mặc định xoá log: action='reply_comment' & success=false (các dòng "Reply failed").
 *
 * Chạy (từ repo root):
 *   pnpm cleanup:logs               # xoá thật các reply_comment thất bại
 *   pnpm cleanup:logs --dry-run     # chỉ đếm, KHÔNG xoá
 *   pnpm cleanup:logs --all-failed  # xoá MỌI log success=false (mọi action)
 *   pnpm cleanup:logs --days 7      # chỉ xoá log cũ hơn 7 ngày (giữ log gần đây)
 */

// Router ở nhà chặn DNS SRV của MongoDB Atlas → ép DNS công cộng (giống worker.ts).
import dns from 'dns'
dns.setServers(['8.8.8.8', '1.1.1.1'])

import mongoose from 'mongoose'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const allFailed = args.includes('--all-failed')
const daysIdx = args.indexOf('--days')
const days = daysIdx !== -1 ? Number(args[daysIdx + 1]) : 0

const uri = process.env['MONGODB_URI']
if (!uri) {
  console.error('Thiếu MONGODB_URI — chạy qua: tsx --env-file=.env ...')
  process.exit(1)
}

// Bộ lọc: mặc định chỉ reply_comment thất bại; --all-failed thì mọi action success=false.
const filter: Record<string, unknown> = allFailed
  ? { success: false }
  : { action: 'reply_comment', success: false }

if (days > 0) {
  filter['timestamp'] = { $lt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
}

async function main(): Promise<void> {
  await mongoose.connect(uri as string)
  const col = mongoose.connection.db!.collection('automationlogs')

  const total = await col.countDocuments(filter)
  console.log(`\n=== Cleanup AutomationLog ===`)
  console.log(`Bộ lọc: ${JSON.stringify(filter)}`)
  console.log(`Khớp: ${total} log`)

  if (total === 0) {
    console.log('Không có gì để xoá.')
    await mongoose.disconnect()
    return
  }

  // Vài mẫu để xác nhận đúng đối tượng trước khi xoá.
  const samples = await col.find(filter).sort({ timestamp: -1 }).limit(3).toArray()
  for (const s of samples) {
    console.log(`  • ${new Date(s['timestamp']).toISOString()} | ${s['action']} | ${s['detail']}`)
  }

  if (dryRun) {
    console.log('\n[DRY-RUN] Không xoá. Bỏ --dry-run để xoá thật.')
    await mongoose.disconnect()
    return
  }

  const res = await col.deleteMany(filter)
  console.log(`\nĐã xoá ${res.deletedCount} log. ✅ (UI sẽ không còn hiển thị các log này)`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('Lỗi cleanup:', err)
  process.exit(1)
})
