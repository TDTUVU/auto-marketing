import { Queue, Worker } from 'bullmq'
import IORedis from 'ioredis'

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

function makeConnection() {
  return new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
}

// Lazy-initialized — không kết nối lúc import, chỉ kết nối khi thực sự dùng
let _queueConnection: IORedis | undefined
let _postQueue: Queue<PostJobData> | undefined
let _commentQueue: Queue<CommentJobData> | undefined
let _autopilotQueue: Queue<AutoPilotJobData> | undefined
let _metricsQueue: Queue<MetricsJobData> | undefined

function getQueueConnection() {
  return (_queueConnection ??= makeConnection())
}

export function getPostQueue() {
  return (_postQueue ??= new Queue<PostJobData>('post-queue', { connection: getQueueConnection() }))
}

export function getCommentQueue() {
  return (_commentQueue ??= new Queue<CommentJobData>('comment-queue', { connection: getQueueConnection() }))
}

export function getAutopilotQueue() {
  return (_autopilotQueue ??= new Queue<AutoPilotJobData>('autopilot-queue', { connection: getQueueConnection() }))
}

export function getMetricsQueue() {
  return (_metricsQueue ??= new Queue<MetricsJobData>('metrics-queue', { connection: getQueueConnection() }))
}

export interface ImageJobData {
  base64: string
  filename: string
  mimeType: string
}

export interface PostJobData {
  postId: string
  accountId: string
  content: string
  images?: ImageJobData[]
}

export function createPostWorker(
  handler: (data: PostJobData) => Promise<void>
): Worker<PostJobData> {
  // Workers each get their own connection — required for BLPOP blocking commands
  return new Worker<PostJobData>(
    'post-queue',
    async (job) => { await handler(job.data) },
    { connection: makeConnection(), concurrency: 1 }
  )
}

export interface CommentJobData {
  postId: string
  accountId: string
  postUrl: string
  postContent: string
}

export function createCommentWorker(
  handler: (data: CommentJobData) => Promise<void>
): Worker<CommentJobData> {
  return new Worker<CommentJobData>(
    'comment-queue',
    async (job) => { await handler(job.data) },
    { connection: makeConnection(), concurrency: 1 }
  )
}

export async function scheduleCommentPoll(data: CommentJobData): Promise<string> {
  const job = await getCommentQueue().add('poll-comments', data, {
    repeat: { every: 5 * 60 * 1000 },
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
    jobId: `comment-poll-${data.postId}`,
  })
  return job.id ?? ''
}

export async function removeCommentPoll(postId: string): Promise<void> {
  const repeatables = await getCommentQueue().getRepeatableJobs()
  for (const job of repeatables) {
    if (job.id === `comment-poll-${postId}`) {
      await getCommentQueue().removeRepeatableByKey(job.key)
      return
    }
  }
}

export async function getTrackedPostIds(): Promise<Set<string>> {
  const repeatables = await getCommentQueue().getRepeatableJobs()
  const ids = new Set<string>()
  for (const job of repeatables) {
    const match = job.id?.match(/^comment-poll-(.+)$/)
    if (match) ids.add(match[1]!)
  }
  return ids
}

export interface AutoPilotJobData {
  configId: string
}

export function createAutoPilotWorker(
  handler: (data: AutoPilotJobData) => Promise<void>
): Worker<AutoPilotJobData> {
  return new Worker<AutoPilotJobData>(
    'autopilot-queue',
    async (job) => { await handler(job.data) },
    { connection: makeConnection(), concurrency: 1 }
  )
}

export async function startAutoPilotScheduler(): Promise<void> {
  await getAutopilotQueue().add(
    'autopilot-tick',
    { configId: '__all__' },
    {
      repeat: { every: 15 * 60 * 1000 },
      jobId: 'autopilot-scheduler',
    }
  )
}

// ─── Metrics ──────────────────────────────────────────────────────────────

export interface MetricsJobData {
  postId: string
}

export function createMetricsWorker(
  handler: (data: MetricsJobData) => Promise<void>
): Worker<MetricsJobData> {
  return new Worker<MetricsJobData>(
    'metrics-queue',
    async (job) => { await handler(job.data) },
    { connection: makeConnection(), concurrency: 1 }
  )
}

/** Enqueue 1 lần để worker (có Playwright) lấy metrics — tránh chạy browser trên web/Railway */
export async function enqueueMetricsRefresh(postId: string): Promise<string> {
  const job = await getMetricsQueue().add(
    'refresh-metrics',
    { postId },
    {
      attempts: 2,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: true,
      removeOnFail: 50,
    }
  )
  return job.id ?? ''
}

export async function schedulePost(data: PostJobData, scheduledAt: Date): Promise<string> {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now())
  const job = await getPostQueue().add('publish-post', data, {
    delay,
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
  })
  return job.id ?? ''
}
