/**
 * Test trực tiếp việc lấy metrics 1 bài đăng (bỏ qua queue/Redis).
 * Dùng để debug khi nút refresh báo timeout — script này in ra lỗi thật.
 *
 * Chạy trên máy có worker:
 *   pnpm test:metrics              → liệt kê các bài published để lấy ID
 *   pnpm test:metrics 64f...abc    → lấy metrics cho bài có ID đó
 */

import { capturePostMetrics } from './lib/metrics'
import { connectDB } from './lib/db'
import { Post, Account } from './lib/db/schema'

const postId = process.argv[2]

async function listPublished() {
  await connectDB()
  const accounts = await Account.find({ platform: 'twitter' }).select('_id name').lean()
  const accountIds = accounts.map((a) => a._id)
  const posts = await Post.find({ accountId: { $in: accountIds }, status: 'published' })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('_id content platformPostId')
    .lean()

  if (posts.length === 0) {
    console.log('Không có bài Twitter nào đã published.')
    return
  }

  console.log(`\nChọn 1 ID rồi chạy lại:  pnpm test:metrics <id>\n`)
  for (const p of posts) {
    const id = p._id.toString()
    const snippet = p.content.replace(/\s+/g, ' ').slice(0, 50)
    const hasUrl = p.platformPostId ? '✓ URL' : '✗ no URL'
    console.log(`  ${id}  [${hasUrl}]  ${snippet}`)
  }
  console.log('')
}

async function main() {
  if (!postId) {
    await listPublished()
    return
  }
  console.log(`[test-metrics] Fetching metrics for post ${postId}...`)
  const snapshot = await capturePostMetrics(postId)
  console.log('[test-metrics] SUCCESS:', JSON.stringify(snapshot, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[test-metrics] FAILED:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
