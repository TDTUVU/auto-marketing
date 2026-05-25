import { Queue, Worker } from 'bullmq'
import IORedis from 'ioredis'

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

function makeConnection() {
  return new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
}

// Queues share one connection (non-blocking)
const queueConnection = makeConnection()

export const postQueue = new Queue('post-queue', { connection: queueConnection })
export const commentQueue = new Queue('comment-queue', { connection: queueConnection })
export const autopilotQueue = new Queue('autopilot-queue', { connection: queueConnection })

export interface PostJobData {
  postId: string
  accountId: string
  content: string
  imagePaths?: string[]
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
  const job = await commentQueue.add('poll-comments', data, {
    repeat: { every: 5 * 60 * 1000 },
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
    jobId: `comment-poll-${data.postId}`,
  })
  return job.id ?? ''
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
  await autopilotQueue.add(
    'autopilot-tick',
    { configId: '__all__' },
    {
      repeat: { every: 15 * 60 * 1000 },
      jobId: 'autopilot-scheduler',
    }
  )
}

export async function schedulePost(data: PostJobData, scheduledAt: Date): Promise<string> {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now())
  const job = await postQueue.add('publish-post', data, {
    delay,
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
  })
  return job.id ?? ''
}
