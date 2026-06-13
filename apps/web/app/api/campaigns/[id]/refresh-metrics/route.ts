import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Campaign } from '@/lib/db/schema'
import { collectCampaignPostIds } from '@/lib/campaigns'
import { enqueueMetricsRefresh } from '@/lib/queue/jobs'

// POST — enqueue job lấy metrics cho mọi bài đã đăng của campaign.
// Worker (Playwright, máy local) xử lý tuần tự; UI poll tiến độ qua /api/metrics/job/[jobId].
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await connectDB()
    const campaign = await Campaign.findById(id).lean()
    if (!campaign) {
      return NextResponse.json({ data: null, error: 'Campaign not found' }, { status: 404 })
    }

    const postIds = await collectCampaignPostIds(campaign)
    const jobIds = await Promise.all(postIds.map((pid) => enqueueMetricsRefresh(pid)))

    return NextResponse.json({ data: { count: postIds.length, jobIds }, error: null })
  } catch (err) {
    console.error('[/api/campaigns/[id]/refresh-metrics] error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}
