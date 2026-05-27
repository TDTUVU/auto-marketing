import { fetch } from 'undici'
import type { AutomationResult, CookieData, PhotoInput, PostPayload, TwitterTokens } from '../types.js'

const GRAPHQL_URL = 'https://x.com/i/api/graphql'
const UPLOAD_URL = 'https://upload.x.com/i/media/upload.json'

const BEARER_TOKEN =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

// queryId — update khi Twitter deploy code mới
const QUERY_IDS = {
  createTweet: 'H-t2v_HvFR07ZBP9aOeKoA',
} as const

const FEATURES = {
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_conversational_replies_downvote_enabled: false,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  articles_preview_enabled: true,
  rweb_cashtags_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
} as const

// ─── Helpers ────────────────────────────────────────────────────────────────

function cookiesToHeader(cookies: CookieData[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

function randomDelay(minMs = 2000, maxMs = 6000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildHeaders(cookies: CookieData[], userAgent: string, tokens: TwitterTokens) {
  return {
    authorization: `Bearer ${BEARER_TOKEN}`,
    'Content-Type': 'application/json',
    Cookie: cookiesToHeader(cookies),
    'User-Agent': userAgent,
    'x-csrf-token': tokens.ct0,
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    'x-twitter-client-language': 'vi',
    Referer: 'https://x.com/',
    Origin: 'https://x.com',
  }
}

export function extractTwitterTokens(cookies: CookieData[]): TwitterTokens {
  const ct0 = cookies.find((c) => c.name === 'ct0')?.value
  if (!ct0) throw new Error('Cookie ct0 không tìm thấy — session Twitter không hợp lệ')
  return { ct0, bearerToken: BEARER_TOKEN }
}

export function extractTwitterUserId(cookies: CookieData[]): string {
  const twid = cookies.find((c) => c.name === 'twid')?.value
  if (!twid) return ''
  // twid format: u%3D1234567890 → decode → u=1234567890
  const decoded = decodeURIComponent(twid)
  return decoded.replace('u=', '')
}

// ─── Media Upload (INIT → APPEND → FINALIZE) ───────────────────────────────

interface UploadedMedia {
  mediaId: string
}

async function uploadMedia(
  cookies: CookieData[],
  userAgent: string,
  tokens: TwitterTokens,
  photo: PhotoInput
): Promise<UploadedMedia> {
  const { buffer, mimeType } = photo

  console.log(`[Twitter:upload] uploading "${photo.filename}" (${buffer.length} bytes, ${mimeType})`)

  const baseHeaders = {
    authorization: `Bearer ${BEARER_TOKEN}`,
    Cookie: cookiesToHeader(cookies),
    'User-Agent': userAgent,
    'x-csrf-token': tokens.ct0,
    'x-twitter-auth-type': 'OAuth2Session',
    Referer: 'https://x.com/',
    Origin: 'https://x.com',
  }

  // INIT
  const initParams = new URLSearchParams({
    command: 'INIT',
    total_bytes: String(buffer.length),
    media_type: mimeType || 'image/jpeg',
    media_category: 'tweet_image',
  })

  const initRes = await fetch(`${UPLOAD_URL}?${initParams}`, {
    method: 'POST',
    headers: { ...baseHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  const initJson = await initRes.json() as { media_id_string?: string }

  if (!initJson.media_id_string) {
    throw new Error(`Media INIT failed: ${JSON.stringify(initJson).slice(0, 300)}`)
  }

  const mediaId = initJson.media_id_string
  console.log(`[Twitter:upload] INIT done — mediaId: ${mediaId}`)

  // APPEND
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).slice(2)}`
  const parts: Buffer[] = []

  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="command"\r\n\r\nAPPEND\r\n`))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media_id"\r\n\r\n${mediaId}\r\n`))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="segment_index"\r\n\r\n0\r\n`))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media_data"\r\n\r\n${buffer.toString('base64')}\r\n`))
  parts.push(Buffer.from(`--${boundary}--\r\n`))

  const appendBody = Buffer.concat(parts)

  const appendRes = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: appendBody,
  })

  if (!appendRes.ok) {
    const text = await appendRes.text()
    throw new Error(`Media APPEND failed (${appendRes.status}): ${text.slice(0, 300)}`)
  }

  console.log(`[Twitter:upload] APPEND done`)

  // FINALIZE
  const finalizeParams = new URLSearchParams({
    command: 'FINALIZE',
    media_id: mediaId,
  })

  const finalizeRes = await fetch(`${UPLOAD_URL}?${finalizeParams}`, {
    method: 'POST',
    headers: { ...baseHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  const finalizeJson = await finalizeRes.json() as { media_id_string?: string; error?: unknown }

  if (finalizeJson.error) {
    throw new Error(`Media FINALIZE failed: ${JSON.stringify(finalizeJson).slice(0, 300)}`)
  }

  console.log(`[Twitter:upload] FINALIZE done — mediaId: ${mediaId}`)
  return { mediaId }
}

// ─── Post Tweet ─────────────────────────────────────────────────────────────

function extractTweetUrl(data: Record<string, unknown>, userId: string): string | undefined {
  const json = JSON.stringify(data)

  // Extract rest_id from create_tweet result
  const restIdMatch = json.match(/"rest_id"\s*:\s*"(\d+)"/)
  if (restIdMatch?.[1]) {
    return `https://x.com/i/status/${restIdMatch[1]}`
  }

  // Fallback: search for tweet URL pattern
  const urlMatch = json.match(/"(https:\/\/(?:x|twitter)\.com\/[^"]*\/status\/\d+)"/)
  if (urlMatch?.[1]) return urlMatch[1]

  return undefined
}

export async function postToTwitter(
  cookies: CookieData[],
  userAgent: string,
  tokens: TwitterTokens,
  payload: PostPayload
): Promise<AutomationResult> {
  await randomDelay()

  // Upload ảnh nếu có
  const mediaIds: string[] = []
  if (payload.photos?.length) {
    console.log(`[Twitter:post] uploading ${payload.photos.length} photo(s)...`)
    for (const photo of payload.photos) {
      try {
        const uploaded = await uploadMedia(cookies, userAgent, tokens, photo)
        mediaIds.push(uploaded.mediaId)
        await randomDelay(1000, 3000)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[Twitter:post] photo upload FAILED for "${photo.filename}":`, msg)
      }
    }
    console.log(`[Twitter:post] upload done — ${mediaIds.length}/${payload.photos.length} succeeded`)
  }

  const variables: Record<string, unknown> = {
    tweet_text: payload.text,
    media: {
      media_entities: mediaIds.map((id) => ({ media_id: id, tagged_users: [] })),
      possibly_sensitive: false,
    },
    semantic_annotation_ids: [],
    disallowed_reply_options: null,
    semantic_annotation_options: { source: 'UniversalLink' },
  }

  const body = JSON.stringify({
    variables,
    features: FEATURES,
    queryId: QUERY_IDS.createTweet,
  })

  try {
    const res = await fetch(`${GRAPHQL_URL}/${QUERY_IDS.createTweet}/CreateTweet`, {
      method: 'POST',
      headers: buildHeaders(cookies, userAgent, tokens),
      body,
    })

    const raw = await res.text()
    let json: Record<string, unknown>
    try {
      json = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return { success: false, error: `Invalid JSON: ${raw.slice(0, 200)}`, timestamp: new Date() }
    }

    const errors = json['errors'] as Array<{ message: string }> | undefined
    if (errors?.length) {
      return { success: false, error: errors.map((e) => e.message).join('; '), timestamp: new Date() }
    }

    const userId = extractTwitterUserId(cookies)
    const postUrl = extractTweetUrl(json, userId)

    const result: AutomationResult = { success: true, timestamp: new Date() }
    if (postUrl) result.postUrl = postUrl
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Network error: ${msg}`, timestamp: new Date() }
  }
}

// ─── Reply Tweet ────────────────────────────────────────────────────────────

export async function replyToTweet(
  cookies: CookieData[],
  userAgent: string,
  tokens: TwitterTokens,
  tweetId: string,
  replyText: string
): Promise<AutomationResult> {
  await randomDelay()

  const variables: Record<string, unknown> = {
    tweet_text: replyText,
    reply: {
      in_reply_to_tweet_id: tweetId,
      exclude_reply_user_ids: [],
    },
    media: {
      media_entities: [],
      possibly_sensitive: false,
    },
    semantic_annotation_ids: [],
    disallowed_reply_options: null,
    semantic_annotation_options: { source: 'Htl' },
  }

  const body = JSON.stringify({
    variables,
    features: FEATURES,
    queryId: QUERY_IDS.createTweet,
  })

  try {
    const res = await fetch(`${GRAPHQL_URL}/${QUERY_IDS.createTweet}/CreateTweet`, {
      method: 'POST',
      headers: buildHeaders(cookies, userAgent, tokens),
      body,
    })

    const raw = await res.text()
    let json: Record<string, unknown>
    try {
      json = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return { success: false, error: `Invalid JSON: ${raw.slice(0, 200)}`, timestamp: new Date() }
    }

    const errors = json['errors'] as Array<{ message: string }> | undefined
    if (errors?.length) {
      return { success: false, error: errors.map((e) => e.message).join('; '), timestamp: new Date() }
    }

    return { success: true, timestamp: new Date() }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Network error: ${msg}`, timestamp: new Date() }
  }
}
