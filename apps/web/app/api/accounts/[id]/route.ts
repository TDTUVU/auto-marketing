import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Account } from '@/lib/db/schema'
import { encrypt } from '@/lib/crypto'
import { parseCookieInput } from '@/lib/session'
import { AGE_RANGE_VALUES, normalizeCategories } from '@/lib/taxonomy'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json() as Record<string, unknown>
    const cookieJson = (body['cookieJson'] as string | undefined)?.trim()
    const userAgent = (body['userAgent'] as string | undefined)?.trim()

    // Nhánh phân loại: cập nhật ageRange/categories, không cần cookie
    if (cookieJson === undefined && ('ageRange' in body || 'categories' in body)) {
      await connectDB()
      const account = await Account.findById(id)
      if (!account) {
        return NextResponse.json({ data: null, error: 'Account not found' }, { status: 404 })
      }

      if ('ageRange' in body) {
        const ageRangeRaw = (body['ageRange'] as string | undefined)?.trim()
        account.ageRange = ageRangeRaw && AGE_RANGE_VALUES.includes(ageRangeRaw) ? ageRangeRaw : undefined
      }
      if ('categories' in body) {
        account.categories = normalizeCategories(body['categories'])
      }
      await account.save()

      return NextResponse.json({
        data: { updated: true, ageRange: account.ageRange, categories: account.categories },
        error: null,
      })
    }

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
