// Kiểm tra metrics (like/comment/share) của 1 bài Facebook — chạy một lần, KHÔNG đụng
// worker PM2. Hữu ích để xác nhận số comment lấy đúng sau khi sửa extractor.
//   pnpm --filter web exec tsx diag-fb-comments.ts                 # bài FB published mới nhất
//   pnpm --filter web exec tsx diag-fb-comments.ts --postId=<id>   # chỉ định bài
// Xem browser thật: thêm METRICS_HEADLESS=false ở env.
import dns from 'dns'
dns.setServers(['8.8.8.8', '1.1.1.1']) // router nhà chặn DNS SRV → ép resolver công cộng cho MongoDB

// Không cần Page insights (chỉ bổ sung views) cho việc kiểm tra comment → tắt cho nhanh.
process.env['FB_PAGE_INSIGHTS'] = process.env['FB_PAGE_INSIGHTS'] ?? 'false'

import { connectDB } from './lib/db/index'
import { Post } from './lib/db/schema'
import { capturePostMetrics } from './lib/metrics'

function argValue(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
  return arg?.split('=')[1]
}

async function main(): Promise<void> {
  await connectDB()

  let postId = argValue('postId')
  if (!postId) {
    const post = await Post.findOne({
      status: 'published',
      platformPostId: { $regex: 'facebook\\.com' },
    })
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean()
    if (!post) {
      console.log('Không tìm thấy bài Facebook đã đăng nào có URL.')
      process.exit(0)
    }
    postId = post._id.toString()
    console.log(`Dùng bài FB mới nhất: ${postId} — ${(post as { platformPostId?: string }).platformPostId}`)
  }

  if (!postId) process.exit(1) // narrow string | undefined → string cho TS
  console.log(`\n=== Kiểm tra metrics cho post ${postId} ===\n`)
  const snap = await capturePostMetrics(postId)
  console.log(
    `\n=== Kết quả: likes:${snap.likes} comments:${snap.comments} shares:${snap.shares} views:${snap.views ?? '?'} ===`
  )
  process.exit(0)
}

main().catch((err) => {
  console.error('Lỗi:', err)
  process.exit(1)
})
