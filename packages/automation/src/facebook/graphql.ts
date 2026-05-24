import { fetch } from 'undici'
import type { AutomationResult, CookieData, PostPayload, SessionTokens } from '../types.js'

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

function buildBaseParams(tokens: FbTokens) {
  return {
    av: tokens.userId,
    __aaid: '0',
    __user: tokens.userId,
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
  variables: Record<string, unknown>
): Promise<AutomationResult> {
  const params = {
    ...buildBaseParams(tokens),
    fb_api_req_friendly_name: friendlyName,
    doc_id: docId,
    variables: JSON.stringify(variables),
  }

  const body = new URLSearchParams(params).toString()

  const res = await fetch(FB_GRAPHQL_URL, {
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

  return { success: true, timestamp: new Date() }
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

  const variables = {
    input: {
      composer_entry_point: 'inline_composer',
      composer_source_surface: 'timeline',
      idempotence_token: `${sessionId}_FEED`,
      source: 'WWW',
      attachments: [],
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
      actor_id: tokens.userId,
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

  return graphqlRequest(
    cookies,
    userAgent,
    tokens,
    'ComposerStoryCreateMutation',
    DOC_IDS.createPost,
    variables
  )
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
