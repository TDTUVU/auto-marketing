import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Account } from '@/lib/db/schema'
import { encrypt } from '@/lib/crypto'
import { parseCookieInput } from '@/lib/session'
import { AGE_RANGE_VALUES, normalizeCategories } from '@/lib/taxonomy'

export async function GET() {
  await connectDB()
  const accounts = await Account.find()
    .select('name platform pageId ageRange categories createdAt')
    .sort({ createdAt: -1 })
    .lean()
  return NextResponse.json({ data: accounts, error: null })
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const name = (body['name'] as string | undefined)?.trim()
    const platform = body['platform'] as string | undefined
    const cookieJson = (body['cookieJson'] as string | undefined)?.trim()
    const pageId = (body['pageId'] as string | undefined)?.trim()
    const userAgent = (body['userAgent'] as string | undefined)?.trim()
    const ageRangeRaw = (body['ageRange'] as string | undefined)?.trim()
    const ageRange = ageRangeRaw && AGE_RANGE_VALUES.includes(ageRangeRaw) ? ageRangeRaw : undefined
    const categories = normalizeCategories(body['categories'])

    if (!name || !platform || !cookieJson) {
      return NextResponse.json(
        { data: null, error: 'name, platform, cookieJson là bắt buộc' },
        { status: 400 }
      )
    }

    if (!['facebook', 'instagram', 'tiktok', 'twitter'].includes(platform)) {
      return NextResponse.json(
        { data: null, error: 'Platform không hợp lệ' },
        { status: 400 }
      )
    }

    let sessionData
    try {
      sessionData = parseCookieInput(cookieJson, userAgent)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cookie JSON không hợp lệ'
      return NextResponse.json({ data: null, error: msg }, { status: 400 })
    }

    if (platform === 'facebook' && !sessionData.userId) {
      return NextResponse.json(
        { data: null, error: 'Không tìm thấy cookie c_user — hãy đăng nhập Facebook rồi export lại cookie' },
        { status: 400 }
      )
    }

    const encryptedSession = encrypt(JSON.stringify(sessionData))

    await connectDB()

    if (pageId) {
      const existing = await Account.findOne({ pageId }).select('name').lean()
      if (existing) {
        return NextResponse.json(
          { data: null, error: `Page ID này đã được dùng bởi tài khoản "${existing.name}"` },
          { status: 409 }
        )
      }
    }

    const account = await Account.create({
      name,
      platform,
      encryptedSession,
      pageId: pageId || undefined,
      ageRange,
      categories,
    })

    return NextResponse.json({
      data: {
        _id: account._id.toString(),
        name: account.name,
        platform: account.platform,
        userId: sessionData.userId,
      },
      error: null,
    })
  } catch (err) {
    console.error('[/api/accounts] error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}
