import { NextResponse } from 'next/server'
import { getMetricsQueue } from '@/lib/queue/jobs'

// GET — trạng thái 1 job metrics để UI phân biệt: thành công / thất bại / đang chờ
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params

  try {
    const job = await getMetricsQueue().getJob(jobId)
    if (!job) {
      // removeOnComplete=true → job xong sẽ biến mất; coi như đã hoàn tất
      return NextResponse.json({ data: { state: 'gone' }, error: null })
    }
    const state = await job.getState()
    return NextResponse.json({
      data: { state, failedReason: job.failedReason ?? null },
      error: null,
    })
  } catch (err) {
    console.error('[/api/metrics/job] error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}
