import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/auth') || pathname.startsWith('/api/uploads')) {
    return NextResponse.next()
  }

  const token = request.cookies.get(COOKIE_NAME)?.value

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    await verifyToken(token)
    return NextResponse.next()
  } catch {
    const url = new URL(pathname.startsWith('/api/') ? '/api/auth/logout' : '/login', request.url)
    const response = pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : NextResponse.redirect(url)
    response.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
    return response
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
