import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Campaign } from '@/lib/db/schema'
import { applyCampaignAllocation, disableCampaignAutopilot } from '@/lib/campaigns'

const STATUSES = ['active', 'paused', 'ended'] as const

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = (await request.json()) as Record<string, unknown>
    const update: Record<string, unknown> = {}

    if (typeof body['name'] === 'string') {
      const name = body['name'].trim()
      if (!name) {
        return NextResponse.json({ data: null, error: 'Tên chiến dịch là bắt buộc' }, { status: 400 })
      }
      update['name'] = name
    }
    if ('brandName' in body) {
      update['brandName'] = (body['brandName'] as string | undefined)?.trim() || undefined
    }
    if (typeof body['status'] === 'string') {
      if (!STATUSES.includes(body['status'] as (typeof STATUSES)[number])) {
        return NextResponse.json({ data: null, error: 'Trạng thái không hợp lệ' }, { status: 400 })
      }
      update['status'] = body['status']
    }
    if (Array.isArray(body['accountIds'])) {
      update['accountIds'] = body['accountIds'] as string[]
    }
    if ('startAt' in body) {
      update['startAt'] = body['startAt'] ? new Date(body['startAt'] as string) : undefined
    }
    if ('endAt' in body) {
      update['endAt'] = body['endAt'] ? new Date(body['endAt'] as string) : undefined
    }

    await connectDB()

    const accountsChanged = Array.isArray(body['accountIds'])
    const before = accountsChanged
      ? await Campaign.findById(id).select('accountIds').lean()
      : null

    const campaign = await Campaign.findByIdAndUpdate(id, update, { new: true }).lean()
    if (!campaign) {
      return NextResponse.json({ data: null, error: 'Campaign not found' }, { status: 404 })
    }

    // Account bị gỡ khỏi campaign → tắt autopilot của chúng.
    if (accountsChanged && before) {
      const newSet = new Set((update['accountIds'] as string[]).map(String))
      const removed = (before.accountIds ?? []).filter((a: unknown) => !newSet.has(String(a)))
      await disableCampaignAutopilot(removed)
    }

    // Đổi danh sách account, hoặc campaign chưa có phân bổ → áp lại để autopilot khớp.
    if (accountsChanged || !campaign.allocation) {
      await applyCampaignAllocation(campaign)
    }

    return NextResponse.json({ data: { updated: true }, error: null })
  } catch (err) {
    console.error('[PATCH /api/campaigns/[id]]', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await connectDB()
    const deleted = await Campaign.findByIdAndDelete(id)
    if (!deleted) {
      return NextResponse.json({ data: null, error: 'Campaign not found' }, { status: 404 })
    }
    return NextResponse.json({ data: { deleted: true }, error: null })
  } catch (err) {
    console.error('[DELETE /api/campaigns/[id]]', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}
