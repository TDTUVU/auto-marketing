import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Account } from '@/lib/db/schema'
import { encrypt } from '@/lib/crypto'
import { parseCookieInput } from '@/lib/session'
import { fetchFbTokens } from '@automation/core'

export async function GET() {
  await connectDB()
  const accounts = await Account.find()
    .select('name platform pageId createdAt')
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

    if (!name || !platform || !cookieJson) {
      return NextResponse.json(
        { data: null, error: 'name, platform, cookieJson là bắt buộc' },
        { status: 400 }
      )
    }

    if (!['facebook', 'instagram', 'tiktok'].includes(platform)) {
      return NextResponse.json(
        { data: null, error: 'Platform không hợp lệ' },
        { status: 400 }
      )
    }

    let sessionData
    try {
      sessionData = parseCookieInput(cookieJson)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cookie JSON không hợp lệ'
      return NextResponse.json({ data: null, error: msg }, { status: 400 })
    }

    if (platform === 'facebook') {
      try {
        const tokens = await fetchFbTokens(sessionData.cookies, sessionData.userAgent)
        sessionData.userId = tokens.userId
        sessionData.tokens = {
          fb_dtsg: tokens.fbDtsg,
          lsd: tokens.lsd,
          rev: tokens.rev,
          hsi: '',
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Không thể xác thực cookie'
        return NextResponse.json(
          { data: null, error: `Cookie không hợp lệ hoặc đã hết hạn: ${msg}` },
          { status: 400 }
        )
      }
    }

    const encryptedSession = encrypt(JSON.stringify(sessionData))

    await connectDB()

    const account = await Account.create({
      name,
      platform,
      encryptedSession,
      pageId: pageId || undefined,
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
