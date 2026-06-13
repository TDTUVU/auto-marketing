import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Campaign } from '@/lib/db/schema'

const STATUSES = ['active', 'paused', 'ended'] as const

export async function GET() {
  await connectDB()
  const campaigns = await Campaign.find().sort({ createdAt: -1 }).lean()
  return NextResponse.json({ data: campaigns, error: null })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const name = (body['name'] as string | undefined)?.trim()
    const brandName = (body['brandName'] as string | undefined)?.trim()
    const status = (body['status'] as string | undefined) ?? 'active'
    const accountIds = Array.isArray(body['accountIds']) ? (body['accountIds'] as string[]) : []
    const startAt = body['startAt'] as string | undefined
    const endAt = body['endAt'] as string | undefined

    if (!name) {
      return NextResponse.json({ data: null, error: 'Tên chiến dịch là bắt buộc' }, { status: 400 })
    }
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
      return NextResponse.json({ data: null, error: 'Trạng thái không hợp lệ' }, { status: 400 })
    }

    await connectDB()

    const campaign = await Campaign.create({
      name,
      brandName: brandName || undefined,
      status,
      accountIds,
      startAt: startAt ? new Date(startAt) : undefined,
      endAt: endAt ? new Date(endAt) : undefined,
    })

    return NextResponse.json({ data: { _id: campaign._id.toString() }, error: null })
  } catch (err) {
    console.error('[/api/campaigns] POST error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}
