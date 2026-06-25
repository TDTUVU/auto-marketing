import { fetch } from 'undici'
import type { CookieData, TwitterTokens } from '../types.js'

const GRAPHQL_URL = 'https://x.com/i/api/graphql'
const BEARER_TOKEN =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

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

export interface TwitterReplyData {
  tweetId: string
  authorId: string
  authorName: string
  authorHandle: string
  text: string
}

function cookiesToHeader(cookies: CookieData[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

// Tweet URL → tweet ID
export function extractTweetId(url: string): string | null {
  const match = url.match(/\/status\/(\d+)/)
  return match?.[1] ?? null
}

export async function fetchTweetReplies(
  cookies: CookieData[],
  userAgent: string,
  tokens: TwitterTokens,
  tweetUrl: string,
  ownerId: string
): Promise<TwitterReplyData[]> {
  const tweetId = extractTweetId(tweetUrl)
  if (!tweetId) throw new Error(`Cannot extract tweet ID from URL: ${tweetUrl}`)

  console.log(`[Twitter:replies] fetching replies for tweet ${tweetId}`)

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

  const replies: TwitterReplyData[] = []
  extractReplies(json, tweetId, ownerId, replies)

  console.log(`[Twitter:replies] found ${replies.length} replies (excluding own)`)
  return replies
}

export function extractReplies(
  obj: unknown,
  focalTweetId: string,
  ownerId: string,
  out: TwitterReplyData[],
  depth = 0
): void {
  if (!obj || typeof obj !== 'object' || depth > 30) return

  if (Array.isArray(obj)) {
    for (const item of obj) extractReplies(item, focalTweetId, ownerId, out, depth + 1)
    return
  }

  const record = obj as Record<string, unknown>

  // Twitter GraphQL response structure:
  // data.threaded_conversation_with_injections_v2.instructions[].entries[]
  // Each entry has content.itemContent.tweet_results.result
  const result = record['result'] as Record<string, unknown> | undefined
  const tweet = result?.['tweet'] as Record<string, unknown> | undefined
  const tweetData = tweet ?? result
  const typename = tweetData?.['__typename'] as string | undefined

  if (typename === 'Tweet') {
    const legacy = tweetData!['legacy'] as Record<string, unknown> | undefined
    const core = tweetData!['core'] as Record<string, unknown> | undefined
    const restId = tweetData!['rest_id'] as string | undefined

    if (legacy && core && restId && restId !== focalTweetId) {
      const inReplyTo = legacy['in_reply_to_status_id_str'] as string | undefined
      if (inReplyTo === focalTweetId) {
        const userResults = core['user_results'] as Record<string, unknown> | undefined
        const userResult = userResults?.['result'] as Record<string, unknown> | undefined
        const userLegacy = userResult?.['legacy'] as Record<string, unknown> | undefined

        const authorId = userResult?.['rest_id'] as string ?? ''
        const authorName = (userLegacy?.['name'] as string) ?? ''
        const authorHandle = (userLegacy?.['screen_name'] as string) ?? ''
        const text = (legacy['full_text'] as string) ?? ''

        if (authorId && authorId !== ownerId && text) {
          const seen = out.some((r) => r.tweetId === restId)
          if (!seen) {
            out.push({ tweetId: restId, authorId, authorName, authorHandle, text })
          }
        }
      }
    }
  }

  for (const value of Object.values(record)) {
    extractReplies(value, focalTweetId, ownerId, out, depth + 1)
  }
}
