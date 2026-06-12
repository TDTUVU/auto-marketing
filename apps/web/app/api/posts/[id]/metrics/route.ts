import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { PostMetric } from '@/lib/db/schema'
import { capturePostMetrics } from '@/lib/metrics'

// POST — refresh: lấy metrics live, lưu snapshot, cập nhật latestMetrics
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const snapshot = await capturePostMetrics(id)
    return NextResponse.json({ data: snapshot, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[/api/posts/[id]/metrics] POST error:', message)
    return NextResponse.json({ data: null, error: message }, { status: 400 })
  }
}

// GET — lịch sử snapshot (time-series) cho 1 bài đăng
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await connectDB()
    const history = await PostMetric.find({ postId: id })
      .sort({ capturedAt: 1 })
      .lean()
    return NextResponse.json({ data: history, error: null })
  } catch (err) {
    console.error('[/api/posts/[id]/metrics] GET error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}
