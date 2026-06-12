import { fetch } from 'undici'
import type { CookieData, PostMetrics, TwitterTokens } from '../types.js'
import { extractTweetId } from './comments.js'

const GRAPHQL_URL = 'https://x.com/i/api/graphql'
const BEARER_TOKEN =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

// Reuse TweetDetail — đã được verify hoạt động ở fetchTweetReplies. Focal tweet chứa sẵn metrics.
const QUERY_IDS = {
  tweetDetail: 'ju7f1DGV1TxWM2fCuD1Qmg',
} as const

const FEATURES = {
  rweb_video_screen_enabled: false,
  rweb_cashtags_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
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
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_enhance_cards_enabled: false,
} as const

const FIELD_TOGGLES = {
  withArticleRichContentState: true,
  withArticlePlainText: false,
  withArticleSummaryText: true,
  withArticleVoiceOver: true,
  withGrokAnalyze: false,
  withDisallowedReplyControls: false,
} as const

function cookiesToHeader(cookies: CookieData[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Tìm focal tweet (rest_id === tweetId) trong response của TweetDetail và đọc metrics.
 * Tweet object: { rest_id, legacy: { favorite_count, retweet_count, reply_count, quote_count, bookmark_count }, views: { count } }
 */
function findTweetMetrics(obj: unknown, tweetId: string, depth = 0): PostMetrics | null {
  if (!obj || typeof obj !== 'object' || depth > 30) return null

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findTweetMetrics(item, tweetId, depth + 1)
      if (found) return found
    }
    return null
  }

  const record = obj as Record<string, unknown>

  const result = record['result'] as Record<string, unknown> | undefined
  const tweet = result?.['tweet'] as Record<string, unknown> | undefined
  const tweetData = tweet ?? result
  const typename = tweetData?.['__typename'] as string | undefined

  if (typename === 'Tweet' && tweetData?.['rest_id'] === tweetId) {
    const legacy = tweetData['legacy'] as Record<string, unknown> | undefined
    const views = tweetData['views'] as Record<string, unknown> | undefined
    if (legacy) {
      const m: PostMetrics = {
        likes: toNum(legacy['favorite_count']),
        comments: toNum(legacy['reply_count']),
        shares: toNum(legacy['retweet_count']) + toNum(legacy['quote_count']),
      }
      if (views?.['count'] != null) m.views = toNum(views['count'])
      if (legacy['bookmark_count'] != null) m.saves = toNum(legacy['bookmark_count'])
      return m
    }
  }

  for (const value of Object.values(record)) {
    const found = findTweetMetrics(value, tweetId, depth + 1)
    if (found) return found
  }
  return null
}

export async function fetchTweetMetrics(
  cookies: CookieData[],
  userAgent: string,
  tokens: TwitterTokens,
  tweetUrl: string
): Promise<PostMetrics> {
  const tweetId = extractTweetId(tweetUrl)
  if (!tweetId) throw new Error(`Cannot extract tweet ID from URL: ${tweetUrl}`)

  console.log(`[Twitter:metrics] fetching metrics for tweet ${tweetId}`)

  const variables = {
    focalTweetId: tweetId,
    rankingMode: 'Relevance',
    includePromotedContent: true,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: true,
    withBirdwatchNotes: true,
    withVoice: true,
  }

  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(FEATURES),
    fieldToggles: JSON.stringify(FIELD_TOGGLES),
  })

  const url = `${GRAPHQL_URL}/${QUERY_IDS.tweetDetail}/TweetDetail?${params}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${BEARER_TOKEN}`,
      Cookie: cookiesToHeader(cookies),
      'User-Agent': userAgent,
      'x-csrf-token': tokens.ct0,
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'vi',
      Referer: 'https://x.com/',
    },
  })

  const json = await res.json() as Record<string, unknown>

  const errors = json['errors'] as Array<{ message: string }> | undefined
  if (errors?.length) {
    throw new Error(`TweetDetail error: ${errors.map((e) => e.message).join('; ')}`)
  }

  const metrics = findTweetMetrics(json, tweetId)
  if (!metrics) {
    throw new Error(`Không tìm thấy tweet ${tweetId} trong response — có thể đã bị xóa hoặc private`)
  }

  console.log(`[Twitter:metrics] tweet ${tweetId} — views:${metrics.views ?? '?'} likes:${metrics.likes} comments:${metrics.comments} shares:${metrics.shares}`)
  return metrics
}
