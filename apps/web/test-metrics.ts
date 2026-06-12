/**
 * Test trực tiếp việc lấy metrics 1 bài đăng (bỏ qua queue/Redis).
 * Dùng để debug khi nút refresh báo timeout — script này in ra lỗi thật.
 *
 * Chạy trên máy có worker:
 *   pnpm test:metrics <postId>
 */

import { capturePostMetrics } from './lib/metrics'

const postId = process.argv[2]

if (!postId) {
  console.error('Usage: pnpm test:metrics <postId>')
  process.exit(1)
}

async function main() {
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
