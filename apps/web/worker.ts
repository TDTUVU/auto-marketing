import IORedis from 'ioredis'
import { getPostQueue, getCommentQueue, startAutoPilotScheduler, scheduleCommentPoll } from './lib/queue/jobs'
import { worker } from './lib/queue/worker'
import { commentWorker } from './lib/queue/commentWorker'
import { autopilotWorker } from './lib/queue/autopilotWorker'
import { metricsWorker } from './lib/queue/metricsWorker'
import { connectDB } from './lib/db/index'
import { Post } from './lib/db/schema'

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

// Verify Redis connectivity + check waiting jobs
const testConn = new IORedis(REDIS_URL, { maxRetriesPerRequest: 1 })
testConn.ping().then(async (res) => {
  console.log('[Worker] Redis ping:', res)

  const waiting = await getPostQueue().getWaitingCount()
  const delayed = await getPostQueue().getDelayedCount()
  const active  = await getPostQueue().getActiveCount()
  const failed  = await getPostQueue().getFailedCount()
  console.log(`[Worker] post-queue — waiting:${waiting} delayed:${delayed} active:${active} failed:${failed}`)

  testConn.disconnect()
}).catch((err) => {
  console.error('[Worker] Redis connection FAILED:', err.message)
  process.exit(1)
})

worker.on('ready', () => console.log('[PostWorker] Worker ready — listening for jobs'))
worker.on('error', (err) => console.error('[PostWorker] Worker error:', err.message))
worker.on('completed', (job) => console.log(`[PostWorker] Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[PostWorker] Job ${job?.id} failed: ${err.message}`))

commentWorker.on('ready', () => console.log('[CommentWorker] Worker ready'))
commentWorker.on('error', (err) => console.error('[CommentWorker] Worker error:', err.message))
commentWorker.on('completed', (job) => console.log(`[CommentWorker] Job ${job.id} completed`))
commentWorker.on('failed', (job, err) => console.error(`[CommentWorker] Job ${job?.id} failed: ${err.message}`))

autopilotWorker.on('ready', () => console.log('[AutoPilotWorker] Worker ready'))
autopilotWorker.on('error', (err) => console.error('[AutoPilotWorker] Worker error:', err.message))
autopilotWorker.on('completed', (job) => console.log(`[AutoPilotWorker] Job ${job.id} completed`))
autopilotWorker.on('failed', (job, err) => console.error(`[AutoPilotWorker] Job ${job?.id} failed: ${err.message}`))

metricsWorker.on('ready', () => console.log('[MetricsWorker] Worker ready'))
metricsWorker.on('error', (err) => console.error('[MetricsWorker] Worker error:', err.message))
metricsWorker.on('completed', (job) => console.log(`[MetricsWorker] Job ${job.id} completed`))
metricsWorker.on('failed', (job, err) => console.error(`[MetricsWorker] Job ${job?.id} failed: ${err.message}`))

startAutoPilotScheduler()
  .then(() => console.log('[AutoPilot] Scheduler registered (every 15 min)'))
  .catch((err) => console.error('[AutoPilot] Failed to register scheduler:', err.message))

// Restore comment poll jobs sau mỗi lần restart (worker hoặc Redis)
// Đồng thời backfill autoReplyEnabled=true cho các bài đang được track trong BullMQ
async function restoreCommentJobs() {
  await connectDB()

  // Bước 1: Backfill — đọc job schedulers (BullMQ 5), set autoReplyEnabled=true cho post chưa có field.
  // Đồng thời migrate: xóa scheduler legacy (key dạng hash từ repeatable cũ) để không poll trùng.
  const schedulers = await getCommentQueue().getJobSchedulers(0, -1, true)
  const bullmqPostIds: string[] = []
  for (const s of schedulers) {
    const match = s.key?.match(/^comment-poll-(.+)$/)
    if (match) bullmqPostIds.push(match[1]!)
    else await getCommentQueue().removeJobScheduler(s.key)
  }
  if (bullmqPostIds.length > 0) {
    const { modifiedCount } = await Post.updateMany(
      { _id: { $in: bullmqPostIds }, autoReplyEnabled: { $ne: true } },
      { $set: { autoReplyEnabled: true } }
    )
    if (modifiedCount > 0) {
      console.log(`[CommentRestore] Backfilled autoReplyEnabled=true for ${modifiedCount} post(s)`)
    }
  }

  // Bước 2: Re-register jobs cho tất cả post có autoReplyEnabled=true (dedup bởi BullMQ)
  const posts = await Post.find({
    autoReplyEnabled: true,
    status: 'published',
    platformPostId: { $exists: true, $ne: '' },
  }).select('_id accountId platformPostId content').lean()

  if (posts.length === 0) {
    console.log('[CommentRestore] No active auto-reply posts')
    return
  }

  let restored = 0
  for (const post of posts) {
    try {
      await scheduleCommentPoll({
        postId: post._id.toString(),
        accountId: post.accountId.toString(),
        postUrl: post.platformPostId!,
        postContent: post.content,
      })
      restored++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[CommentRestore] Failed to restore post ${post._id}:`, msg)
    }
  }
  console.log(`[CommentRestore] Restored ${restored}/${posts.length} comment poll jobs`)
}

restoreCommentJobs().catch((err) => console.error('[CommentRestore] Error:', err.message))

console.log('[Worker] Post + Comment + AutoPilot + Metrics workers started — waiting for jobs...')

async function shutdown() {
  await Promise.all([worker.close(), commentWorker.close(), autopilotWorker.close(), metricsWorker.close()])
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
