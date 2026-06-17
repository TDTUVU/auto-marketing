import { capturePostMetrics } from '../metrics'
import { createMetricsWorker, type MetricsJobData } from './jobs'

async function handleMetricsJob(data: MetricsJobData): Promise<void> {
  console.log('[MetricsWorker] processing job — postId:', data.postId)
  const snapshot = await capturePostMetrics(data.postId)
  console.log(
    `[MetricsWorker] done — postId:${data.postId} likes:${snapshot.likes} comments:${snapshot.comments} shares:${snapshot.shares}`
  )
}

export const metricsWorker = createMetricsWorker(handleMetricsJob)
