import { NextResponse } from 'next/server'
import { signToken, COOKIE_NAME, TOKEN_MAX_AGE } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { password?: string }

    if (!body.password || body.password !== process.env['APP_PASSWORD']) {
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
    console.error('[/api/auth/login] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
