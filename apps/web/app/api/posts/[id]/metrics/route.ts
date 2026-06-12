import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Post, PostMetric } from '@/lib/db/schema'
import { enqueueMetricsRefresh } from '@/lib/queue/jobs'

// POST — enqueue 1 job để worker (có Playwright) lấy metrics live.
// Không fetch trực tiếp ở đây vì web/Railway không chạy được headless browser.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await connectDB()

    const post = await Post.findById(id)
    if (!post) {
      return NextResponse.json({ data: null, error: 'Post not found' }, { status: 404 })
    }
    if (post.status !== 'published') {
      return NextResponse.json(
        { data: null, error: `Post chưa published (status: ${post.status})` },
        { status: 400 }
      )
    }
    if (!post.platformPostId) {
      return NextResponse.json(
        { data: null, error: 'Post không có URL bài viết — chưa thể lấy metrics' },
        { status: 400 }
      )
    }

    const jobId = await enqueueMetricsRefresh(id)
    return NextResponse.json({ data: { queued: true, jobId }, error: null })
  } catch (err) {
    console.error('[/api/posts/[id]/metrics] POST error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}

// GET — lịch sử snapshot (time-series) cho 1 bài đăng, mới nhất ở cuối
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
