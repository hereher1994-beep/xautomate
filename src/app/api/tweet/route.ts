import { NextRequest, NextResponse } from 'next/server';

// X's hardcoded public bearer token (shipped in their web JS bundle)
const X_BEARER_TOKEN =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

// ── Fallback query IDs (most recent first) ────────────────────────────────────
// These are used when the live scrape fails. X rotates these every 2-4 weeks.
// The first entry is the most recently confirmed working ID.
const FALLBACK_QUERY_IDS = [
  'LBFRMJBLzXkI-zdK3fCj1Q', // confirmed working Jun 2025
  'oB-5XsHNAbjvARJEc8CZFw',
  'tTsjMKyhajZvK4q76mpIbg',
  '7TKRKCPuAGsmYde0CudbVg',
];

// ── In-memory cache for the live-scraped query ID ─────────────────────────────
let cachedQueryId: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch X's main JS bundle and extract the current CreateTweet queryId.
 * X ships this in their web bundle as: queryId:"<id>",operationName:"CreateTweet"
 */
async function fetchLiveQueryId(): Promise<string | null> {
  try {
    // Step 1: fetch X homepage to find the main JS bundle URL
    const homeRes = await fetch('https://x.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!homeRes.ok) return null;
    const html = await homeRes.text();

    // Find main JS bundle URLs — they look like /responsive-web/client-web/main.<hash>.js
    const bundleMatches = html.matchAll(
      /src="(https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/main\.[^"]+\.js)"/g
    );
    const bundleUrls: string[] = [];
    for (const m of bundleMatches) {
      bundleUrls.push(m[1]);
    }

    // Also try the api bundle
    const apiBundleMatches = html.matchAll(
      /src="(https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/[^"]*api[^"]*\.js)"/g
    );
    for (const m of apiBundleMatches) {
      bundleUrls.push(m[1]);
    }

    if (bundleUrls.length === 0) {
      // Try fetching the main bundle directly via a known pattern
      const scriptMatches = html.matchAll(/src="(https:\/\/abs\.twimg\.com[^"]+\.js)"/g);
      for (const m of scriptMatches) {
        bundleUrls.push(m[1]);
      }
    }

    // Search each bundle for the CreateTweet queryId
    for (const url of bundleUrls.slice(0, 5)) {
      try {
        const jsRes = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Referer: 'https://x.com/',
          },
          signal: AbortSignal.timeout(10000),
        });
        if (!jsRes.ok) continue;
        const js = await jsRes.text();

        // Pattern: queryId:"<id>",operationName:"CreateTweet"
        const match =
          js.match(/queryId:"([^"]+)",operationName:"CreateTweet"/) ||
          js.match(/"queryId":"([^"]+)","operationName":"CreateTweet"/) ||
          js.match(/\{queryId:"([^"]+)",operationName:"CreateTweet"/);

        if (match?.[1]) {
          return match[1];
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the best available CreateTweet queryId.
 * Tries live scrape first (cached for 30 min), falls back to hardcoded list.
 */
async function getQueryIds(): Promise<string[]> {
  const now = Date.now();

  // Return cached ID if still fresh
  if (cachedQueryId && now - cacheTimestamp < CACHE_TTL_MS) {
    // Put cached ID first, then fallbacks
    return [cachedQueryId, ...FALLBACK_QUERY_IDS.filter((id) => id !== cachedQueryId)];
  }

  // Try to fetch live ID
  const liveId = await fetchLiveQueryId();
  if (liveId) {
    cachedQueryId = liveId;
    cacheTimestamp = now;
    console.log(`[tweet] Live queryId fetched: ${liveId}`);
    return [liveId, ...FALLBACK_QUERY_IDS.filter((id) => id !== liveId)];
  }

  console.log('[tweet] Live queryId fetch failed, using fallback IDs');
  return FALLBACK_QUERY_IDS;
}

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
  longform_notetweets_inline_media_enabled: true,
  articles_preview_enabled: true,
  rweb_video_timestamps_enabled: true,
  rweb_tipjar_consumption_enabled: true,
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
  responsive_web_jetfuel_frame: false,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: false,
  post_ctas_fetch_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_cashtags_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  payments_enabled: false,
};

interface TweetRequestBody {
  cookieString: string;
  ct0: string;
  tweetText: string;
  imageDataUrl?: string;
  forceRefresh?: boolean;
}

function generateTransactionId(): string {
  const timestamp = Date.now();
  const raw = `${timestamp}:${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`;
  return Buffer.from(raw).toString('base64').replace(/[=+/]/g, '').slice(0, 80);
}

function extractNewCt0FromSetCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/(?:^|,)\s*ct0=([^;,]+)/i);
  return match ? match[1].trim() : null;
}

function rebuildCookieStringWithNewCt0(cookieString: string, newCt0: string): string {
  if (!newCt0) return cookieString;
  if (/(?:^|;\s*)ct0=/.test(cookieString)) {
    return cookieString.replace(/((?:^|;\s*))ct0=[^;]*/i, `$1ct0=${newCt0}`);
  }
  return `${cookieString}; ct0=${newCt0}`;
}

async function uploadMedia(
  cookieString: string,
  ct0: string,
  imageDataUrl: string
): Promise<string | null> {
  try {
    const base64Match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!base64Match) return null;
    const mimeType = base64Match[1];
    const base64Data = base64Match[2];

    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });

    const formData = new FormData();
    formData.append('media', blob, 'image');
    formData.append('media_category', 'tweet_image');

    const res = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${X_BEARER_TOKEN}`,
        'x-csrf-token': ct0,
        Cookie: cookieString,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        Origin: 'https://x.com',
        Referer: 'https://x.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      body: formData,
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { media_id_string?: string };
    return data.media_id_string ?? null;
  } catch {
    return null;
  }
}

async function tryCreateTweet(
  queryId: string,
  cookieString: string,
  ct0: string,
  tweetText: string,
  mediaId?: string
): Promise<{ ok: boolean; status: number; body: unknown; newCt0: string | null }> {
  const variables: Record<string, unknown> = {
    tweet_text: tweetText,
    dark_request: false,
    semantic_annotation_ids: [],
    disallowed_reply_options: null,
    media: mediaId
      ? {
          media_entities: [{ media_id: mediaId, tagged_users: [] }],
          possibly_sensitive: false,
        }
      : { media_entities: [], possibly_sensitive: false },
  };

  const url = `https://x.com/i/api/graphql/${queryId}/CreateTweet`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${X_BEARER_TOKEN}`,
    'x-csrf-token': ct0,
    Cookie: cookieString,
    'x-twitter-active-user': 'yes',
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-client-language': 'en',
    'x-client-transaction-id': generateTransactionId(),
    'x-client-uuid': `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
    Origin: 'https://x.com',
    Referer: 'https://x.com/compose/post',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      variables,
      features: CREATE_TWEET_FEATURES,
      queryId,
    }),
  });

  const setCookieHeader = res.headers.get('set-cookie');
  const newCt0 = extractNewCt0FromSetCookie(setCookieHeader);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => '(no body)');
  }

  return { ok: res.ok, status: res.status, body, newCt0 };
}

export async function POST(req: NextRequest) {
  let payload: TweetRequestBody;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { cookieString, ct0, tweetText, imageDataUrl } = payload;

  if (!cookieString || !ct0 || !tweetText) {
    return NextResponse.json(
      { error: 'Missing required fields: cookieString, ct0, tweetText' },
      { status: 400 }
    );
  }

  // Upload image if provided
  let mediaId: string | undefined;
  if (imageDataUrl) {
    mediaId = (await uploadMedia(cookieString, ct0, imageDataUrl)) ?? undefined;
  }

  // Get query IDs — live scraped first, then fallbacks
  const queryIds = await getQueryIds();

  const errors: { queryId: string; status: number; body: unknown }[] = [];

  let currentCt0 = ct0;
  let currentCookieString = cookieString;

  for (const queryId of queryIds) {
    try {
      const result = await tryCreateTweet(
        queryId,
        currentCookieString,
        currentCt0,
        tweetText,
        mediaId
      );

      // Always update ct0 if X sent a new one
      if (result.newCt0 && result.newCt0 !== currentCt0) {
        currentCt0 = result.newCt0;
        currentCookieString = rebuildCookieStringWithNewCt0(currentCookieString, result.newCt0);
      }

      if (result.ok) {
        const data = result.body as Record<string, unknown>;
        const tweetResults = (data?.data as Record<string, unknown>)
          ?.create_tweet as Record<string, unknown> | undefined;
        const hasResult = !!(
          tweetResults?.tweet_results &&
          Object.keys(tweetResults.tweet_results as object).length > 0
        );

        if (hasResult) {
          // Cache this working queryId for future requests
          cachedQueryId = queryId;
          cacheTimestamp = Date.now();

          return NextResponse.json({
            success: true,
            queryId,
            mediaId: mediaId ?? null,
            totalQueryIds: queryIds.length,
            data: result.body,
            newCt0: result.newCt0 ?? null,
          });
        }

        // HTTP 200 but no tweet_results — try next ID
        errors.push({ queryId, status: result.status, body: result.body });
        continue;
      }

      if (result.status === 403 || result.status === 401) {
        return NextResponse.json(
          {
            error: `Authentication failed (HTTP ${result.status}). Your cookies may be expired or invalid. Please export fresh cookies from x.com and paste them in the Session Cookies field.`,
            status: result.status,
            detail: result.body,
          },
          { status: result.status }
        );
      }

      if (result.status === 429) {
        return NextResponse.json(
          { error: 'Rate limited by X. Wait before retrying.', status: 429, detail: result.body },
          { status: 429 }
        );
      }

      // 404 = dead query ID, 5xx = server error — try next ID
      errors.push({ queryId, status: result.status, body: result.body });
    } catch (err) {
      errors.push({ queryId, status: 0, body: String(err) });
    }
  }

  // Invalidate cached query ID since it failed
  cachedQueryId = null;
  cacheTimestamp = 0;

  return NextResponse.json(
    {
      error:
        'All CreateTweet query IDs failed. Your session cookies may be expired — refresh them from your browser.',
      attempts: errors,
      totalQueryIds: queryIds.length,
      hint: 'Open x.com in your browser, export fresh cookies via Cookie-Editor, and paste them in the Session Cookies field.',
    },
    { status: 502 }
  );
}
