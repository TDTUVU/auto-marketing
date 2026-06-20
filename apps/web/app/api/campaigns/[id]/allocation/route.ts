import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectDB } from '@/lib/db'
import { Campaign } from '@/lib/db/schema'
import { applyCampaignAllocation } from '@/lib/campaigns'

const schema = z.object({
  totalPostsPerDay: z.number().int().min(0).max(100),
  platformWeights: z.record(z.string(), z.number().min(0)),
})

// POST — áp phân bổ tài nguyên thủ công từ panel: chia tổng budget theo trọng số
// platform xuống AutoPilotConfig của từng account (giữ tone/categories/minIntervalDays).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: 'Dữ liệu phân bổ không hợp lệ' }, { status: 400 })
    }

    await connectDB()
    const campaign = await Campaign.findById(id).lean()
    if (!campaign) {
      return NextResponse.json({ data: null, error: 'Campaign not found' }, { status: 404 })
    }

    const results = await applyCampaignAllocation(campaign, parsed.data)
    return NextResponse.json({ data: { results }, error: null })
  } catch (err) {
    console.error('[/api/campaigns/[id]/allocation] error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}
