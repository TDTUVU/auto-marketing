/**
 * Test trực tiếp việc lấy metrics (bỏ qua queue/Redis). In ra lỗi thật.
 *
 *   pnpm test:metrics                          → liệt kê bài published để lấy ID
 *   pnpm test:metrics <postId>                 → lấy metrics theo Post trong DB
 *   pnpm test:metrics https://x.com/.../status/<id>   → test 1 tweet bất kỳ bằng session account twitter
 *   pnpm test:metrics https://facebook.com/<id>/posts/<fbid>  → test 1 bài FB bằng session account facebook
 */

import { capturePostMetrics } from './lib/metrics'
import { connectDB } from './lib/db'
import { Post, Account } from './lib/db/schema'
import { loadSessionForAccount } from './lib/session'
import { fetchTweetMetrics, fetchFacebookMetrics } from '@automation/core'

const arg = process.argv[2]

async function listPublished() {
  await connectDB()
  const accounts = await Account.find({ platform: { $in: ['twitter', 'facebook'] } })
    .select('_id name platform')
    .lean()
  const accountById = new Map(accounts.map((a) => [a._id.toString(), a]))
  const posts = await Post.find({ accountId: { $in: accounts.map((a) => a._id) }, status: 'published' })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('_id content platformPostId accountId')
    .lean()

  if (posts.length === 0) {
    console.log('Không có bài Twitter/Facebook nào đã published.')
    return
  }
  console.log(`\nChọn 1 ID rồi chạy lại:  pnpm test:metrics <id>\n`)
  for (const p of posts) {
    const snippet = p.content.replace(/\s+/g, ' ').slice(0, 50)
    const hasUrl = p.platformPostId ? '✓ URL' : '✗ no URL'
    const platform = accountById.get(p.accountId.toString())?.platform ?? '?'
    console.log(`  ${p._id.toString()}  [${platform}]  [${hasUrl}]  ${snippet}`)
  }
  console.log('')
}

// Test 1 bài bất kỳ bằng session của account đầu tiên đúng platform
async function testUrl(url: string) {
  await connectDB()
  const platform = url.includes('facebook.com') ? 'facebook' : 'twitter'
  const acc = await Account.findOne({ platform }).select('_id name').lean()
  if (!acc) {
    console.log(`Không có account ${platform} nào trong DB.`)
    return
  }
  const session = await loadSessionForAccount(acc._id.toString())
  if (!session) {
    console.log(`Không load được session cho account "${acc.name}".`)
    return
  }
  console.log(`[test-metrics] dùng account ${platform} "${acc.name}" để lấy metrics cho: ${url}`)
  const m = platform === 'facebook'
    ? await fetchFacebookMetrics(session, url)
    : await fetchTweetMetrics(session, url)
  console.log('[test-metrics] SUCCESS:', JSON.stringify(m, null, 2))
}

async function main() {
  if (!arg) {
    await listPublished()
    return
  }
  if (arg.startsWith('http') || arg.includes('/status/')) {
    await testUrl(arg)
    return
  }
  console.log(`[test-metrics] Fetching metrics for post ${arg}...`)
  const snapshot = await capturePostMetrics(arg)
  console.log('[test-metrics] SUCCESS:', JSON.stringify(snapshot, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[test-metrics] FAILED:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
