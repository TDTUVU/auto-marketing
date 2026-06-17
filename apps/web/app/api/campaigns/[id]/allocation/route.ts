import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectDB } from '@/lib/db'
import { Campaign, Account, AutoPilotConfig } from '@/lib/db/schema'
import { computeAllocation, type AllocAccount } from '@/lib/allocation'

const schema = z.object({
  totalPostsPerDay: z.number().int().min(0).max(100),
  platformWeights: z.record(z.string(), z.number().min(0)),
})

// POST — chia tổng budget bài/ngày theo trọng số platform xuống AutoPilotConfig
// của từng account trong campaign. Chỉ ghi nhịp đăng (postsPerDay/postTimes/enabled),
// giữ nguyên tone/categories/minIntervalDays nếu account đã cấu hình.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: 'Dữ liệu phân bổ không hợp lệ' }, { status: 400 })
    }
    const { totalPostsPerDay, platformWeights } = parsed.data

    await connectDB()
    const campaign = await Campaign.findById(id)
    if (!campaign) {
      return NextResponse.json({ data: null, error: 'Campaign not found' }, { status: 404 })
    }

    const accounts = await Account.find({ _id: { $in: campaign.accountIds } })
      .select('_id name platform')
      .lean()
    const allocAccounts: AllocAccount[] = accounts.map((a) => ({
      id: a._id.toString(),
      name: a.name,
      platform: a.platform,
    }))

    const results = computeAllocation(totalPostsPerDay, platformWeights, allocAccounts)

    for (const r of results) {
      await AutoPilotConfig.findOneAndUpdate(
        { accountId: r.accountId },
        {
          $set: {
            postsPerDay: Math.max(r.postsPerDay, 1),
            postTimes: r.postTimes.length > 0 ? r.postTimes : ['12:00'],
            enabled: r.postsPerDay > 0,
          },
          $setOnInsert: { accountId: r.accountId },
        },
        { upsert: true }
      )
    }

    campaign.allocation = { totalPostsPerDay, platformWeights, appliedAt: new Date() }
    await campaign.save()

    return NextResponse.json({ data: { results }, error: null })
  } catch (err) {
    console.error('[/api/campaigns/[id]/allocation] error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}
