// Dọn các post status='failed' gần nhất.
// Mặc định CHỈ xem trước (dry-run). Thêm cờ --yes để xóa thật.
//   pnpm --filter web exec tsx --env-file=.env clean-failed-posts.ts          # preview
//   pnpm --filter web exec tsx --env-file=.env clean-failed-posts.ts --yes    # xóa thật
// Số lượng tùy chọn qua --limit=N (mặc định 4).
import dns from 'dns'
dns.setServers(['8.8.8.8', '1.1.1.1']) // router nhà chặn DNS SRV → ép resolver công cộng cho MongoDB

import { connectDB } from './lib/db/index'
import { Post } from './lib/db/schema'

function argValue(name: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (!arg) return fallback
  const n = Number(arg.split('=')[1])
  return Number.isFinite(n) && n > 0 ? n : fallback
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--yes')
  const limit = argValue('limit', 4)

  await connectDB()

  // failed gần nhất theo thời điểm cập nhật (lúc job đánh dấu fail)
  const posts = await Post.find({ status: 'failed' })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean()

  if (posts.length === 0) {
    console.log('Không có post nào ở trạng thái failed.')
    process.exit(0)
  }

  console.log(`Tìm thấy ${posts.length} post failed gần nhất:`)
  for (const p of posts) {
    const when = (p as { updatedAt?: Date }).updatedAt ?? p.createdAt
    const preview = (p.content ?? '').replace(/\s+/g, ' ').slice(0, 60)
    console.log(`  - ${p._id}  ${new Date(when).toISOString()}  "${preview}"  err: ${p.errorMessage ?? '-'}`)
  }

  if (!apply) {
    console.log('\n[DRY-RUN] Chưa xóa gì. Chạy lại với --yes để xóa các post trên.')
    process.exit(0)
  }

  const ids = posts.map((p) => p._id)
  const res = await Post.deleteMany({ _id: { $in: ids } })
  console.log(`\nĐã xóa ${res.deletedCount} post failed.`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Lỗi:', err)
  process.exit(1)
})
