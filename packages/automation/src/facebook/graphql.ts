import { fetch } from 'undici'
import type { AutomationResult, CookieData, PhotoInput, PostPayload, SessionTokens } from '../types.js'

const FB_GRAPHQL_URL = 'https://www.facebook.com/api/graphql/'
const FB_HOME_URL = 'https://www.facebook.com/'

// doc_id captured via mitmproxy — update khi Facebook deploy code mới (thường 2-4 tuần/lần)
const DOC_IDS = {
  createPost: '27043104642009435',
  createComment: '27380149638290893',
} as const

// Relay provider flags — bắt buộc, Facebook validate các giá trị này
const RELAY_PROVIDERS = {
  '__relay_internal__pv__CometUFIShareActionMigrationrelayprovider': true,
  '__relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider': true,
  '__relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider': true,
  '__relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider': true,
  '__relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider': 'AUTO_TRANSLATE',
  '__relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider': false,
  '__relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider': false,
  '__relay_internal__pv__IsWorkUserrelayprovider': false,
  '__relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider': false,
  '__relay_internal__pv__CometUFISingleLineUFIrelayprovider': true,
  '__relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider': true,
  '__relay_internal__pv__FBReels_enable_view_dubbed_audio_type_gkrelayprovider': true,
  '__relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider': false,
  '__relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider': false,
  '__relay_internal__pv__IsMergQAPollsrelayprovider': false,
  '__relay_internal__pv__ShouldEnableBakedInTextStoriesrelayprovider': false,
  '__relay_internal__pv__StoriesShouldIncludeFbNotesrelayprovider': true,
} as const

// ─── Token extraction ───────────────────────────────────────────────────────

export interface FbTokens {
  fbDtsg: string
  lsd: string
  userId: string
  rev: string
}

/** Chuyển SessionTokens (từ file) sang FbTokens để dùng trong requests */
export function tokensFromSession(userId: string, t: SessionTokens): FbTokens {
  return { fbDtsg: t.fb_dtsg, lsd: t.lsd, userId, rev: t.rev }
}

/**
 * Fetch Facebook homepage và extract các token cần thiết cho GraphQL requests.
 * Cần chạy mỗi khi session mới hoặc token hết hạn.
 */
export async function fetchFbTokens(
  cookies: CookieData[],
  userAgent: string,
  debug = false
): Promise<FbTokens> {
  const res = await fetch(FB_HOME_URL, {
    headers: {
      Cookie: cookiesToHeader(cookies),
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
    },
    redirect: 'follow',
  })

  const html = await res.text()

  if (debug) {
    const previewLen = 3000
    console.log(`    HTML status : ${res.status}`)
    console.log(`    HTML length : ${html.length} chars`)
    console.log(`    HTML preview:\n${html.slice(0, previewLen)}`)
  }

  const fbDtsg = extractToken(html, [
    /"DTSGInitialData",\[\],\{"token":"([^"]+)"\}/,
    /"DTSGInitData",\[\],\{"token":"([^"]+)"\}/,
    /name="fb_dtsg"[^>]*value="([^"]+)"/,
    /"fb_dtsg":"([^"]+)"/,
  ], 'fb_dtsg')

  const lsd = extractToken(html, [
    /"LSD",\[\],\{"token":"([^"]+)"\}/,
    /"lsd":"([^"]+)"/,
  ], 'lsd')

  const userId = extractToken(html, [
    /"USER_ID":"([^"]+)"/,
    /"userID":"([^"]+)"/,
    /"actorID":"([^"]+)"/,
  ], 'USER_ID')

  const rev = extractToken(html, [
    /"client_revision":(\d+)/,
    /"__rev":(\d+)/,
    /"revision":(\d+)/,
  ], 'client_revision')

  return { fbDtsg, lsd, userId, rev }
}

function extractToken(html: string, patterns: RegExp[], name: string): string {
  for (const regex of patterns) {
    const match = html.match(regex)
    if (match?.[1]) return match[1]
  }
  throw new Error(`Không tìm thấy ${name} trong trang Facebook. Session có thể đã hết hạn.`)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function cookiesToHeader(cookies: CookieData[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

function randomDelay(minMs = 2000, maxMs = 6000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function buildBaseParams(tokens: FbTokens, actorOverride?: string) {
  return {
    av: actorOverride ?? tokens.userId,  // actor view — pageId khi đăng lên page
    __aaid: '0',
    __user: tokens.userId,               // luôn là user cá nhân đang đăng nhập
    __a: '1',
    __comet_req: '15',
    fb_dtsg: tokens.fbDtsg,
    lsd: tokens.lsd,
    jazoest: String(2 + tokens.lsd.split('').reduce((s, c) => s + c.charCodeAt(0), 0)),
    __rev: tokens.rev,
    __spin_r: tokens.rev,
    __spin_b: 'trunk',
    fb_api_caller_class: 'RelayModern',
    server_timestamps: 'true',
  }
}

async function graphqlRequest(
  cookies: CookieData[],
  userAgent: string,
  tokens: FbTokens,
  friendlyName: string,
  docId: string,
  variables: Record<string, unknown>,
  actorOverride?: string
): Promise<AutomationResult & { _data?: Record<string, unknown> }> {
  const params = {
    ...buildBaseParams(tokens, actorOverride),
    fb_api_req_friendly_name: friendlyName,
    doc_id: docId,
    variables: JSON.stringify(variables),
  }

  const body = new URLSearchParams(params).toString()

  let res: Response
  try {
    res = await fetch(FB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookiesToHeader(cookies),
        'User-Agent': userAgent,
        'X-FB-Friendly-Name': friendlyName,
        'X-FB-LSD': tokens.lsd,
        Referer: FB_HOME_URL,
        Origin: 'https://www.facebook.com',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        'Sec-Fetch-Site': 'same-origin',
      },
      body,
    })
  } catch (err) {
    const e = err as Error & { cause?: unknown }
    const cause = e.cause instanceof Error ? e.cause.message : String(e.cause ?? '')
    console.error('[graphqlRequest] fetch threw:', e.message, '| cause:', cause)
    return { success: false, error: `Network error: ${e.message} — ${cause}`, timestamp: new Date() }
  }

  // Facebook prepends "for (;;);" to GraphQL responses — strip trước khi parse
  const raw = await res.text()
  const cleaned = raw.startsWith('for (;;);') ? raw.slice('for (;;);'.length) : raw

  let json: Record<string, unknown>
  try {
    json = JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    return { success: false, error: `Invalid JSON response: ${raw.slice(0, 200)}`, timestamp: new Date() }
  }

  // Legacy API format: json['error'] là number (0 = ok)
  const legacyError = json['error'] as number | undefined
  if (legacyError !== undefined && legacyError !== 0) {
    const summary = json['errorSummary'] ?? ''
    const desc = json['errorDescription'] ?? ''
    return {
      success: false,
      error: `[FB ${legacyError}] ${summary} — ${desc}`,
      timestamp: new Date(),
    }
  }

  // GraphQL format: json['errors'] là array
  // Facebook hay trả WARNING errors kèm data thật — chỉ fail nếu không có data
  const graphqlErrors = json['errors'] as Array<{ message: string; severity?: string }> | undefined
  const hasFatalError = graphqlErrors?.some((e) => e.severity !== 'WARNING')
  const hasData = json['data'] != null

  if (!res.ok || hasFatalError || (!hasData && graphqlErrors?.length)) {
    const msgs = graphqlErrors?.map((e) => e.message).join('; ') ?? 'unknown error'
    return { success: false, error: msgs, timestamp: new Date() }
  }

  return { success: true, timestamp: new Date(), _data: json }
}

// ─── Photo Upload ──────────────────────────────────────────────────────────

// Facebook upload dùng rupload endpoint riêng cho từng file
const FB_RUPLOAD_URL = 'https://www.facebook.com/ajax/react_composer/attachments/photo/upload'

export interface UploadedPhoto {
  photoId: string
}

export async function uploadPhoto(
  cookies: CookieData[],
  userAgent: string,
  tokens: FbTokens,
  photo: PhotoInput,
  actorId?: string
): Promise<UploadedPhoto> {
  const { buffer: imgBuffer, filename, mimeType } = photo
  const contentType = mimeType || 'image/jpeg'

  console.log(`[uploadPhoto] uploading "${filename}" (${imgBuffer.length} bytes, ${contentType})`)

  const actor = actorId ?? tokens.userId

  // Dùng multipart form — gửi file kèm token qua GraphQL endpoint
  const boundary = `----WebKitFormBoundary${randomUUID().replace(/-/g, '').slice(0, 16)}`

  const formFields: Record<string, string> = {
    ...buildBaseParams(tokens, actorId),
    fb_api_req_friendly_name: 'CometPhotoUploadMutation',
    source: '8',
    profile_id: actor,
    waterfallxapp: 'comet',
    farr: '0',
    upload_speed: '0',
    qn: randomUUID(),
  }

  const parts: Buffer[] = []
  for (const [key, value] of Object.entries(formFields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
    ))
  }

  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
  ))
  parts.push(imgBuffer)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

  const body = Buffer.concat(parts)

  // Thử nhiều endpoint — Facebook thay đổi thường xuyên
  const uploadUrls = [
    FB_RUPLOAD_URL,
    'https://upload.facebook.com/ajax/react_composer/attachments/photo/upload',
    FB_GRAPHQL_URL,
  ]

  let lastError = ''
  for (const url of uploadUrls) {
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          Cookie: cookiesToHeader(cookies),
          'User-Agent': userAgent,
          'X-FB-LSD': tokens.lsd,
          'X-FB-Friendly-Name': 'CometPhotoUploadMutation',
          Referer: FB_HOME_URL,
          Origin: 'https://www.facebook.com',
          'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
          'Sec-Fetch-Site': 'same-origin',
        },
        body,
      })
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      console.error(`[uploadPhoto] fetch failed for ${url}:`, lastError)
      continue
    }

    if (res.status === 404) {
      console.log(`[uploadPhoto] 404 for ${url} — trying next endpoint`)
      lastError = `404 from ${url}`
      continue
    }

    const raw = await res.text()
    const cleaned = raw.startsWith('for (;;);') ? raw.slice(9) : raw

    console.log(`[uploadPhoto] ${url} — status: ${res.status}, preview: ${cleaned.slice(0, 300)}`)

    let json: Record<string, unknown>
    try {
      json = JSON.parse(cleaned) as Record<string, unknown>
    } catch {
      lastError = `invalid JSON from ${url}: ${raw.slice(0, 200)}`
      continue
    }

    const photoId = extractPhotoId(json)
    if (photoId) {
      console.log(`[uploadPhoto] success via ${url} — photoId: ${photoId}`)
      return { photoId }
    }

    lastError = `no photoId from ${url}: ${JSON.stringify(json).slice(0, 300)}`
    console.log(`[uploadPhoto] ${lastError}`)
  }

  throw new Error(`Photo upload failed on all endpoints — last: ${lastError}`)
}

function extractPhotoId(json: Record<string, unknown>): string | undefined {
  // Cấu trúc response thay đổi theo endpoint — tìm ở mọi nơi phổ biến
  const payload = json['payload'] as Record<string, unknown> | undefined
  const data = json['data'] as Record<string, unknown> | undefined

  // endpoint cũ: payload.photoID
  const fromPayload = payload?.['photoID'] ?? payload?.['photo_id'] ?? payload?.['fbid']
  if (fromPayload) return String(fromPayload)

  // GraphQL response: data.photo.id hoặc data.node.id
  if (data) {
    const photo = data['photo'] as Record<string, unknown> | undefined
    const node = data['node'] as Record<string, unknown> | undefined
    const id = photo?.['id'] ?? node?.['id'] ?? data['id'] ?? data['fbid']
    if (id) return String(id)
  }

  // Top level
  const topLevel = json['photoID'] ?? json['photo_id'] ?? json['fbid'] ?? json['id']
  if (topLevel) return String(topLevel)

  return undefined
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function postToFacebook(
  cookies: CookieData[],
  userAgent: string,
  tokens: FbTokens,
  payload: PostPayload
): Promise<AutomationResult> {
  await randomDelay()

  const sessionId = randomUUID()
  const actorId = payload.pageId ?? tokens.userId
  const isPage = !!payload.pageId

  // Upload ảnh nếu có
  const photoIds: string[] = []
  const uploadErrors: string[] = []
  if (payload.photos?.length) {
    console.log(`[postToFacebook] uploading ${payload.photos.length} photo(s)...`)
    for (const photo of payload.photos) {
      try {
        const uploaded = await uploadPhoto(
          cookies, userAgent, tokens, photo,
          isPage ? actorId : undefined
        )
        photoIds.push(uploaded.photoId)
        console.log(`[postToFacebook] photo "${photo.filename}" uploaded — id: ${uploaded.photoId}`)
        await randomDelay(1000, 3000)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[postToFacebook] photo upload FAILED for "${photo.filename}":`, msg)
        uploadErrors.push(`${photo.filename}: ${msg}`)
      }
    }
    console.log(`[postToFacebook] upload done — ${photoIds.length}/${payload.photos.length} succeeded`)
  }

  const attachments = photoIds.map((id) => ({
    photo: { id },
  }))

  const variables = {
    input: {
      composer_entry_point: 'inline_composer',
      composer_source_surface: 'timeline',
      idempotence_token: `${sessionId}_FEED`,
      source: 'WWW',
      attachments,
      audience: {
        privacy: {
          allow: [],
          base_state: 'EVERYONE',
          deny: [],
          tag_expansion_state: 'UNSPECIFIED',
        },
      },
      message: {
        ranges: [],
        text: payload.text,
      },
      with_tags_ids: null,
      inline_activities: [],
      text_format_preset_id: '0',
      logging: { composer_session_id: sessionId },
      tracking: [null],
      actor_id: actorId,
      client_mutation_id: '1',
    },
    feedLocation: 'TIMELINE',
    feedbackSource: 0,
    focusCommentID: null,
    gridMediaWidth: 230,
    groupID: null,
    scale: 1,
    privacySelectorRenderLocation: 'COMET_STREAM',
    renderLocation: 'timeline',
    useDefaultActor: false,
    isTimeline: true,
    isFeed: false,
    isGroup: false,
    isEvent: false,
    ...RELAY_PROVIDERS,
  }

  const result = await graphqlRequest(
    cookies,
    userAgent,
    tokens,       // tokens.userId luôn là user cá nhân — đúng cho __user
    'ComposerStoryCreateMutation',
    DOC_IDS.createPost,
    variables,
    isPage ? actorId : undefined  // actorOverride cho av khi đăng lên page
  )

  if (result.success && result._data) {
    // Thử extract Facebook story URL từ response
    try {
      const d = result._data as Record<string, unknown>
      const storyCreate = (d['data'] as Record<string, unknown>)?.['story_create'] as Record<string, unknown> | undefined
      const story = storyCreate?.['story'] as Record<string, unknown> | undefined
      const url = story?.['url'] as string | undefined
      if (url) result.postUrl = url.startsWith('http') ? url : `https://www.facebook.com${url}`
    } catch { /* URL extraction optional — không fail nếu không có */ }
  }

  const { _data: _, ...clean } = result
  return clean
}

export async function createComment(
  cookies: CookieData[],
  userAgent: string,
  tokens: FbTokens,
  feedbackId: string,
  commentText: string
): Promise<AutomationResult> {
  await randomDelay()

  const variables = {
    feedLocation: 'TIMELINE',
    feedbackSource: 0,
    groupID: null,
    input: {
      actor_id: tokens.userId,
      client_mutation_id: String(Math.floor(Math.random() * 100)),
      attachments: null,
      feedback_id: feedbackId,
      formatting_style: null,
      message: {
        ranges: [],
        text: commentText,
      },
      idempotence_token: `client:${randomUUID()}`,
      session_id: randomUUID(),
      feedback_source: 'TIMELINE',
      is_tracking_encrypted: true,
      tracking: [null],
      vod_video_timestamp: null,
    },
    inviteShortLinkKey: null,
    renderLocation: null,
    scale: 1,
    useDefaultActor: false,
    focusCommentID: null,
    translationType: 'AUTO_TRANSLATE',
    '__relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider': false,
    '__relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider': false,
    '__relay_internal__pv__IsWorkUserrelayprovider': false,
    '__relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider': 'AUTO_TRANSLATE',
  }

  return graphqlRequest(
    cookies,
    userAgent,
    tokens,
    'useCometUFICreateCommentMutation',
    DOC_IDS.createComment,
    variables
  )
}
