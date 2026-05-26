import { NextResponse } from 'next/server'
import { signToken, COOKIE_NAME, TOKEN_MAX_AGE } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { password?: string }
    const envPassword = process.env['APP_PASSWORD']

    if (!envPassword) {
      console.error('[auth/login] APP_PASSWORD env var is not set!')
      return NextResponse.json({ error: 'Server chưa cấu hình mật khẩu' }, { status: 500 })
    }

    if (!process.env['JWT_SECRET']) {
      console.error('[auth/login] JWT_SECRET env var is not set!')
      return NextResponse.json({ error: 'Server chưa cấu hình JWT secret' }, { status: 500 })
    }

    if (!body.password || body.password !== envPassword) {
      return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 })
    }

    const token = await signToken()

    const response = NextResponse.json({ ok: true })
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: TOKEN_MAX_AGE,
    })

    return response
  } catch (err) {
    console.error('[auth/login] error:', err)
    return NextResponse.json({ error: 'Lỗi server, kiểm tra logs' }, { status: 500 })
  }
}
