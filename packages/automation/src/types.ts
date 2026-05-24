export type Platform = 'facebook' | 'instagram' | 'tiktok'

export interface Account {
  id: string
  platform: Platform
  name: string
  cookiesPath: string
}

export interface PostPayload {
  text: string
  imageUrls?: string[]
  scheduledAt?: Date
  pageId?: string  // Facebook Page ID — nếu có sẽ đăng lên Page thay vì timeline cá nhân
}

export interface AutomationResult {
  success: boolean
  postId?: string
  postUrl?: string   // Facebook permalink URL sau khi đăng thành công
  error?: string
  timestamp: Date
}

export interface CommentPayload {
  postId: string
  commentId: string
  replyText: string
}

export interface SessionTokens {
  fb_dtsg: string
  lsd: string
  rev: string
  hsi: string
  user_id?: string
}

export interface SessionData {
  userId: string
  cookies: CookieData[]
  userAgent: string
  lastRefreshed: Date
  tokens?: SessionTokens
}

export interface CookieData {
  name: string
  value: string
  domain: string
  path: string
  expires?: number
  httpOnly?: boolean
  secure?: boolean
}
