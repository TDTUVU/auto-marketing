import IORedis from 'ioredis'
import { getPostQueue, startAutoPilotScheduler } from './lib/queue/jobs'
import { worker } from './lib/queue/worker'
import { commentWorker } from './lib/queue/commentWorker'
import { autopilotWorker } from './lib/queue/autopilotWorker'

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

startAutoPilotScheduler()
  .then(() => console.log('[AutoPilot] Scheduler registered (every 15 min)'))
  .catch((err) => console.error('[AutoPilot] Failed to register scheduler:', err.message))

console.log('[Worker] Post + Comment + AutoPilot workers started — waiting for jobs...')

async function shutdown() {
  await Promise.all([worker.close(), commentWorker.close(), autopilotWorker.close()])
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
