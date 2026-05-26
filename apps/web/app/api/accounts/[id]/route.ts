import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Account } from '@/lib/db/schema'
import { encrypt } from '@/lib/crypto'
import { parseCookieInput } from '@/lib/session'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json() as Record<string, unknown>
    const cookieJson = (body['cookieJson'] as string | undefined)?.trim()
    const userAgent = (body['userAgent'] as string | undefined)?.trim()

    if (!cookieJson) {
      return NextResponse.json({ data: null, error: 'cookieJson là bắt buộc' }, { status: 400 })
    }

    let sessionData
    try {
      sessionData = parseCookieInput(cookieJson, userAgent)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cookie JSON không hợp lệ'
      return NextResponse.json({ data: null, error: msg }, { status: 400 })
    }

    if (!sessionData.userId) {
      return NextResponse.json(
        { data: null, error: 'Không tìm thấy cookie c_user — hãy đăng nhập Facebook rồi export lại' },
        { status: 400 }
      )
    }

    await connectDB()

    const account = await Account.findById(id)
    if (!account) {
      return NextResponse.json({ data: null, error: 'Account not found' }, { status: 404 })
    }

    account.encryptedSession = encrypt(JSON.stringify(sessionData))
    await account.save()

    return NextResponse.json({
      data: { updated: true, userId: sessionData.userId },
      error: null,
    })
  } catch (err) {
    console.error('[PATCH /api/accounts/[id]]', err)
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
    const deleted = await Account.findByIdAndDelete(id)

    if (!deleted) {
      return NextResponse.json({ data: null, error: 'Account not found' }, { status: 404 })
    }

    return NextResponse.json({ data: { deleted: true }, error: null })
  } catch (err) {
    console.error('[DELETE /api/accounts/[id]]', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}
