export type Platform = 'facebook' | 'twitter' | 'instagram' | 'tiktok'

export interface Account {
  id: string
  platform: Platform
  name: string
  cookiesPath: string
}

export interface PhotoInput {
  buffer: Buffer
  filename: string
  mimeType: string
}

export interface PostPayload {
  text: string
  photos?: PhotoInput[]
  scheduledAt?: Date
  pageId?: string
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

export interface TwitterTokens {
  ct0: string
  bearerToken: string
}

/** Chỉ số bài đăng, chuẩn hóa chung cho mọi platform. Field nào platform không hỗ trợ thì undefined. */
export interface PostMetrics {
  views?: number      // X: impressions; FB: chỉ video mới có
  likes: number       // X: favorite_count; FB: reaction_count
  comments: number    // X: reply_count; FB: comment_count
  shares: number      // X: retweet_count + quote_count; FB: share_count
  saves?: number      // X: bookmark_count; FB: không có
}

export interface SessionData {
  userId: string
  cookies: CookieData[]
  userAgent: string
  lastRefreshed: Date
  tokens?: SessionTokens
  twitterTokens?: TwitterTokens
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
