import { NextRequest, NextResponse } from 'next/server';

interface TweetRequestBody {
  cookieString: string;
  ct0: string;
  tweetText: string;
  imageDataUrl?: string;
}

// Up-to-date query IDs — same list as the edge function, newest first
const CREATE_TWEET_QUERY_IDS = [
  'Qkq4oPdZYuNB_Qw3TDuFqQ',
  '7TKRKCPuAGsmYde0CudbVg',
  'oB-5XsHNAbjvARJEc8CZFw',
  'Uf3io9zVp1DsYxrmL5FJ7g',
  'tTsjMKyhajZvK4q76mpIbg',
  'bI4CD9xFNXB9oZFQMEFfiA',
  'SoVnbfCycZ7fERGCwpZkYA',
];

const CREATE_TWEET_FEATURES = {
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  articles_preview_enabled: true,
  rweb_video_timestamps_enabled: true,
  rweb_tipjar_consumption_enabled: false,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_media_download_video_enabled: false,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  premium_content_api_read_enabled: false,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: false,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_cashtags_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
};

/**
 * Extract a specific cookie value by name from a cookie string.
 * Handles both "name=value; name2=value2" and JSON array formats.
 */
function extractCookieValue(cookieString: string, name: string): string | null {
  if (cookieString.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(cookieString) as Array<{ name: string; value: string }>;
      const found = arr.find((c) => c.name === name);
      return found?.value ?? null;
    } catch {
      // fall through
    }
  }
  const parts = cookieString.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const cookieName = trimmed.slice(0, eqIdx).trim();
    if (cookieName === name) {
      return trimmed.slice(eqIdx + 1).trim();
    }
  }
  return null;
}

/**
 * Normalize cookie string to "name=value; name2=value2" header format.
 */
function normalizeCookieHeader(cookieString: string): string {
  if (cookieString.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(cookieString) as Array<{ name: string; value: string }>;
      return arr.map((c) => `${c.name}=${c.value}`).join('; ');
    } catch {
      // fall through
    }
  }
  return cookieString
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('; ');
}

function generateTransactionId(queryId: string): string {
  // Use a simple hex-based transaction ID — base64 with padding can be rejected by X.com
  const timestamp = Date.now().toString(16);
  const rand = Math.random().toString(16).slice(2, 18);
  return `${queryId.slice(0, 8)}-${timestamp}-${rand}`;
}

export async function POST(req: NextRequest) {
  let payload: TweetRequestBody;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { cookieString, tweetText, imageDataUrl } = payload;

  if (!cookieString || !tweetText) {
    return NextResponse.json(
      { error: 'Missing required fields: cookieString, tweetText' },
      { status: 400 }
    );
  }

  const ct0 = extractCookieValue(cookieString, 'ct0') ?? payload.ct0 ?? '';
  if (!ct0) {
    return NextResponse.json(
      {
        error:
          'Could not find ct0 CSRF token in your cookies. Make sure you exported ALL cookies from x.com (including ct0).',
      },
      { status: 400 }
    );
  }

  const cookieHeader = normalizeCookieHeader(cookieString);

  // Upload image first if provided
  let mediaId: string | undefined;
  if (imageDataUrl) {
    try {
      const uploaded = await uploadMediaV1(cookieHeader, ct0, imageDataUrl);
      if (uploaded) mediaId = uploaded;
    } catch (e) {
      console.warn('[tweet] Image upload failed, posting without image:', e);
    }
  }

  // Try each GraphQL query ID in order — newest first
  let lastAuthError = false;
  let lastRateLimited = false;

  for (const queryId of CREATE_TWEET_QUERY_IDS) {
    try {
      const result = await tryCreateTweet(queryId, cookieHeader, ct0, tweetText, mediaId);

      if (result.authError) {
        // Don't stop immediately — X.com sometimes returns 403 for CSRF issues on one endpoint
        // but accepts the same cookies on another query ID. Try all before giving up.
        lastAuthError = true;
        console.warn(`[tweet] queryId=${queryId} auth error — trying next query ID`);
        continue;
      }

      if (result.rateLimited) {
        lastRateLimited = true;
        continue;
      }

      if (result.success && result.tweetId) {
        console.log(`[tweet] ✓ Posted via queryId=${queryId} tweetId=${result.tweetId}`);
        return NextResponse.json({
          success: true,
          method: 'graphql',
          queryId,
          tweetId: result.tweetId,
          message: 'Tweet posted successfully',
        });
      }

      // HTTP 200 but no tweet_results — try next query ID
      console.warn(`[tweet] queryId=${queryId} returned 200 but no tweet_results. Trying next.`);
    } catch (e) {
      console.warn(`[tweet] queryId=${queryId} threw exception:`, e);
    }
  }

  // All query IDs exhausted — report the most specific error
  if (lastRateLimited) {
    return NextResponse.json(
      { error: 'Rate limited by X. Please wait a few minutes before trying again.' },
      { status: 429 }
    );
  }

  if (lastAuthError) {
    return NextResponse.json(
      {
        error:
          'Session cookies are expired or invalid. Please export fresh cookies from x.com and paste them in the Session Cookies field.',
      },
      { status: 401 }
    );
  }

  return NextResponse.json(
    {
      error:
        'Tweet failed — X did not confirm the tweet was created. Your cookies may be expired or X is blocking the request. Please re-export fresh cookies from x.com.',
    },
    { status: 500 }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL CreateTweet — single query ID attempt
// ─────────────────────────────────────────────────────────────────────────────
async function tryCreateTweet(
  queryId: string,
  cookieHeader: string,
  ct0: string,
  tweetText: string,
  mediaId?: string
): Promise<{
  success: boolean;
  tweetId?: string;
  authError?: boolean;
  rateLimited?: boolean;
  error?: string;
}> {
  const variables: Record<string, unknown> = {
    tweet_text: tweetText,
    dark_request: false,
    semantic_annotation_ids: [],
    media: mediaId
      ? { media_entities: [{ media_id: mediaId, tagged_users: [] }], possibly_sensitive: false }
      : { media_entities: [], possibly_sensitive: false },
  };

  const res = await fetch(`https://x.com/i/api/graphql/${queryId}/CreateTweet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:
        'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
      'x-csrf-token': ct0,
      Cookie: cookieHeader,
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': 'en',
      'x-client-transaction-id': generateTransactionId(queryId),
      Origin: 'https://x.com',
      Referer: 'https://x.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    body: JSON.stringify({ variables, features: CREATE_TWEET_FEATURES, queryId }),
  });

  const text = await res.text();
  console.log(`[tweet/graphql] queryId=${queryId} status=${res.status} body=${text.slice(0, 400)}`);

  // 429 = rate limit (not an auth issue)
  if (res.status === 429) {
    return { success: false, rateLimited: true };
  }

  // 401 = definitively expired/invalid session
  if (res.status === 401) {
    return { success: false, authError: true };
  }

  // 403 = could be CSRF mismatch, not necessarily expired cookies — don't treat as hard auth error
  // Let the caller try the next query ID; only mark authError if we also see auth error codes in body
  if (res.status === 403) {
    // Try to parse body for explicit auth error codes
    try {
      const errJson = JSON.parse(text);
      const errors = (errJson as any).errors;
      if (errors?.length) {
        const hasHardAuthError = errors.some(
          (e: any) => e?.code === 32 || e?.code === 64 || e?.code === 89
        );
        if (hasHardAuthError) {
          return { success: false, authError: true };
        }
      }
    } catch {
      // ignore parse error
    }
    // 403 without explicit auth error codes — treat as transient, not auth failure
    return { success: false, error: `HTTP 403 (CSRF/transient): ${text.slice(0, 200)}` };
  }

  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    return { success: false, error: 'Could not parse response JSON' };
  }

  // Check for top-level GraphQL errors
  const errors = (json as any).errors;
  if (errors?.length) {
    const firstErr = errors[0];
    const errMsg: string = firstErr?.message ?? 'GraphQL error';
    // Only treat as auth error for explicit Twitter auth error codes
    const isHardAuthError =
      firstErr?.code === 32 ||  // Could not authenticate you
      firstErr?.code === 64 ||  // Your account is suspended
      firstErr?.code === 89;    // Invalid or expired token
    // Soft auth keywords — only flag if no tweet_results present
    const hasSoftAuthKeyword =
      errMsg.toLowerCase().includes('not authorized') ||
      errMsg.toLowerCase().includes('authentication required');
    return { success: false, authError: isHardAuthError || hasSoftAuthKeyword, error: errMsg };
  }

  // Flexible check: handle all known X GraphQL response shapes for tweet_results
  const tweetResult =
    (json as any)?.data?.create_tweet?.tweet_results?.result ??
    (json as any)?.data?.createTweet?.tweet_results?.result;

  if (tweetResult) {
    // Shape 1: direct rest_id on result
    if (tweetResult.rest_id) {
      return { success: true, tweetId: tweetResult.rest_id };
    }
    // Shape 2: TweetWithVisibilityResults — tweet is nested under result.tweet
    if (tweetResult.tweet?.rest_id) {
      return { success: true, tweetId: tweetResult.tweet.rest_id };
    }
    // Shape 3: legacy id_str fallback
    const legacyId =
      tweetResult.legacy?.id_str ??
      tweetResult.tweet?.legacy?.id_str;
    if (legacyId) {
      return { success: true, tweetId: legacyId };
    }
  }

  // No tweet_results — this query ID didn't work; caller will try the next one
  return { success: false, error: 'No tweet_results in response' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Media upload via v1.1
// ─────────────────────────────────────────────────────────────────────────────
async function uploadMediaV1(
  cookieHeader: string,
  ct0: string,
  imageDataUrl: string
): Promise<string | null> {
  const base64Match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!base64Match) return null;

  const base64Data = base64Match[2];

  const formData = new FormData();
  formData.append('media_data', base64Data);
  formData.append('media_category', 'tweet_image');

  const res = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: {
      Cookie: cookieHeader,
      'X-Csrf-Token': ct0,
      Authorization:
        'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'X-Twitter-Auth-Type': 'OAuth2Session',
    },
    body: formData,
  });

  if (!res.ok) {
    console.warn(`[tweet/media] Upload failed: ${res.status}`);
    return null;
  }

  let json = await res.json();
  return json.media_id_string ?? null;
}
