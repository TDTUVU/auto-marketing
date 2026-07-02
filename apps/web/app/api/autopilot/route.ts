import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { AutoPilotConfig, Account, Product } from '@/lib/db/schema'

export async function GET(request: Request) {
  await connectDB()

  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')

  if (accountId) {
    const config = await AutoPilotConfig.findOne({ accountId }).lean()
    return NextResponse.json({ data: config, error: null })
  }

  const configs = await AutoPilotConfig.find().lean()
  return NextResponse.json({ data: configs, error: null })
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const accountId = body['accountId'] as string | undefined

    if (!accountId) {
      return NextResponse.json({ data: null, error: 'accountId is required' }, { status: 400 })
    }

    await connectDB()

    const account = await Account.findById(accountId)
    if (!account) {
      return NextResponse.json({ data: null, error: 'Account not found' }, { status: 404 })
    }

    // Bật auto-pilot mà chưa có sản phẩm active nào → worker sẽ skip im lặng (pickProduct null).
    // Chặn + báo lại thay vì để user tưởng đã bật thành công.
    if (body['enabled'] === true) {
      const productCount = await Product.countDocuments({ accountId, isActive: true })
      if (productCount === 0) {
        return NextResponse.json(
          { data: null, error: 'Tài khoản chưa có sản phẩm trong catalog — thêm sản phẩm trước khi bật auto-pilot' },
          { status: 400 }
        )
      }
    }

    const config = await AutoPilotConfig.findOneAndUpdate(
      { accountId },
      {
        $set: {
          enabled: body['enabled'] ?? false,
          postsPerDay: body['postsPerDay'] ?? 2,
          postTimes: body['postTimes'] ?? ['09:00', '19:00'],
          tone: body['tone'] ?? 'friendly',
          minIntervalDays: body['minIntervalDays'] ?? 7,
          categories: body['categories'] ?? [],
          autoReplyEnabled: body['autoReplyEnabled'] ?? false,
          replyTone: body['replyTone'] ?? 'friendly',
          skipSpam: body['skipSpam'] ?? true,
        },
        $setOnInsert: { accountId },
      },
      { upsert: true, new: true }
    )

    return NextResponse.json({ data: config, error: null })
  } catch (err) {
    console.error('[/api/autopilot] error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}
