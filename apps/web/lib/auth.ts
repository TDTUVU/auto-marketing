import { SignJWT, jwtVerify } from 'jose'

export const COOKIE_NAME = 'auth_token'
export const TOKEN_MAX_AGE = 7 * 24 * 60 * 60

function getSecret() {
  const secret = process.env['JWT_SECRET']
  if (!secret) throw new Error('JWT_SECRET env var is required')
  return new TextEncoder().encode(secret)
}

export async function signToken(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<boolean> {
  await jwtVerify(token, getSecret())
  return true
}
