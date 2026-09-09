import { NextRequest, NextResponse } from 'next/server';

// X's hardcoded public bearer token (shipped in their web JS bundle)
const X_BEARER_TOKEN =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

// Hardcoded fallback query IDs (used when live scrape fails)
const FALLBACK_QUERY_IDS = [
  '7TKRKCPuAGsmYde0CudbVg',
  'Uf3io9zVp1DsYxrmL5FJ7g',
  'SoVnbfCycZ7fERGCwpZkYA',
  'a1p9RmpkLBFds-d3O44bWg',
  '5CdvsV_zjv4L64XFifAglw',
  'tTsjMKyhajZvK4q76mpIbg',
];

// In-memory cache for the live-scraped queryId
let cachedQueryId: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Scrape X's main JS bundle to find the current CreateTweet queryId.
 * X embeds it as: queryId:"<id>",operationName:"CreateTweet"
 * Returns null if scraping fails for any reason.
 */
async function scrapeLiveQueryId(): Promise<string | null> {
  try {
    // Fetch X's home page to find the main JS bundle URL
    const homeRes = await fetch('https://x.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!homeRes.ok) return null;

    const html = await homeRes.text();

    // Find all JS bundle URLs that are likely to contain GraphQL query IDs
    // X uses paths like /responsive-web/client-web/main.<hash>.js
    const bundleMatches = [
      ...html.matchAll(/src="(https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/main\.[^"]+\.js)"/g),
      ...html.matchAll(/src="(https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/[^"]*bundle[^"]*\.js)"/g),...html.matchAll(/"(https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/[^"]+\.js)"/g),
    ];

    const bundleUrls: string[] = [];
    for (const m of bundleMatches) {
      if (!bundleUrls.includes(m[1])) bundleUrls.push(m[1]);
    }

    // Also try the api.js or graphql-specific bundles
    const apiMatches = [
      ...html.matchAll(/src="(https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/[^"]*api[^"]*\.js)"/g),
    ];
    for (const m of apiMatches) {
      if (!bundleUrls.includes(m[1])) bundleUrls.push(m[1]);
    }

    // Search each bundle for the CreateTweet queryId pattern
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

        // Pattern 1: queryId:"<id>",operationName:"CreateTweet"
        const m1 = js.match(/queryId:"([^"]{15,30})",operationName:"CreateTweet"/);
        if (m1) return m1[1];

        // Pattern 2: operationName:"CreateTweet",queryId:"<id>"
        const m2 = js.match(/operationName:"CreateTweet",queryId:"([^"]{15,30})"/);
        if (m2) return m2[1];

        // Pattern 3: {queryId:"<id>",operationName:"CreateTweet"
        const m3 = js.match(/\{queryId:"([^"]{15,30})",operationName:"CreateTweet"/);
        if (m3) return m3[1];
      } catch {
        // continue to next bundle
      }
    }

    // Fallback: try fetching the graphql manifest directly
    try {
      const manifestRes = await fetch(
        'https://abs.twimg.com/responsive-web/client-web/graphql-manifest.json',
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Referer: 'https://x.com/',
          },
          signal: AbortSignal.timeout(6000),
        }
      );
      if (manifestRes.ok) {
        const manifest = (await manifestRes.json()) as Record<string, { queryId?: string }>;
        const entry = manifest['CreateTweet'];
        if (entry?.queryId) return entry.queryId;
      }
    } catch {
      // ignore
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Returns the list of query IDs to try, with the live-scraped ID first (if available).
 */
async function getQueryIds(): Promise<string[]> {
  const now = Date.now();

  // Refresh cache if stale or empty
  if (!cachedQueryId || now - cacheTimestamp > CACHE_TTL_MS) {
    const live = await scrapeLiveQueryId();
    if (live) {
      cachedQueryId = live;
      cacheTimestamp = now;
    } else {
      // Reset cache so next request tries again
      cachedQueryId = null;
      cacheTimestamp = 0;
    }
  }

  if (cachedQueryId && !FALLBACK_QUERY_IDS.includes(cachedQueryId)) {
    return [cachedQueryId, ...FALLBACK_QUERY_IDS];
  }

  if (cachedQueryId) {
    // Move the live ID to front even if it's in the fallback list
    return [cachedQueryId, ...FALLBACK_QUERY_IDS.filter((id) => id !== cachedQueryId)];
  }

  return FALLBACK_QUERY_IDS;
}

const CREATE_TWEET_FEATURES = {
  // Core flags
  interactive_text_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_media_download_video_enabled: false,
  responsive_web_enhance_cards_enabled: false,
  rweb_video_timestamps_enabled: true,
  // Newer flags required by current X web client
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: false,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: true,
  responsive_web_grok_image_annotation_enabled: false,
  responsive_web_grok_imagine_annotation_enabled: false,
  responsive_web_grok_community_note_auto_translation_is_enabled: false,
  responsive_web_jetfuel_frame: false,
  responsive_web_profile_redirect_enabled: false,
  premium_content_api_read_enabled: false,
};

interface TweetRequestBody {
  cookieString: string;
  ct0: string;
  tweetText: string;
  imageDataUrl?: string;
}

/**
 * Upload a single image to X's media upload endpoint.
 * Returns the media_id_string on success, or null on failure.
 */
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
        'Authorization': `Bearer ${X_BEARER_TOKEN}`,
        'x-csrf-token': ct0,
        'Cookie': cookieString,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'Origin': 'https://x.com',
        'Referer': 'https://x.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: formData,
    });

    if (!res.ok) return null;

    const data = await res.json() as { media_id_string?: string };
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
): Promise<{ ok: boolean; status: number; body: unknown; newCt0?: string }> {
  const variables: Record<string, unknown> = {
    tweet_text: tweetText,
    dark_request: false,
    semantic_annotation_ids: [],
  };

  if (mediaId) {
    variables.media = {
      media_entities: [{ media_id: mediaId, tagged_users: [] }],
      possibly_sensitive: false,
    };
  } else {
    variables.media = { media_entities: [], possibly_sensitive: false };
  }

  const url = `https://x.com/i/api/graphql/${queryId}/CreateTweet`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${X_BEARER_TOKEN}`,
      'x-csrf-token': ct0,
      'Cookie': cookieString,
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': 'en',
      'Origin': 'https://x.com',
      'Referer': 'https://x.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    body: JSON.stringify({
      variables,
      features: CREATE_TWEET_FEATURES,
      queryId,
    }),
  });

  // Capture rotated ct0 from response Set-Cookie header if present
  let newCt0: string | undefined;
  const setCookieHeader = res.headers.get('set-cookie');
  if (setCookieHeader) {
    const ct0Match = setCookieHeader.match(/(?:^|,\s*)ct0=([^;,]+)/i);
    if (ct0Match) {
      newCt0 = ct0Match[1];
    }
  }

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

  // Get query IDs: live-scraped first, then hardcoded fallbacks
  const queryIds = await getQueryIds();

  // Try each query ID in order until one succeeds
  const errors: { queryId: string; status: number; body: unknown }[] = [];

  for (const queryId of queryIds) {
    try {
      const result = await tryCreateTweet(queryId, cookieString, ct0, tweetText, mediaId);

      if (result.ok) {
        const data = result.body as Record<string, unknown>;
        if (data?.errors && Array.isArray(data.errors) && data.errors.length > 0) {
          errors.push({ queryId, status: result.status, body: result.body });
          continue;
        }
        // If we used the live-scraped ID successfully, update cache timestamp
        if (queryId === cachedQueryId) {
          cacheTimestamp = Date.now();
        }
        return NextResponse.json({
          success: true,
          queryId,
          mediaId: mediaId ?? null,
          newCt0: result.newCt0 ?? null,
          data: result.body,
        });
      }

      if (result.status === 403 || result.status === 401) {
        return NextResponse.json(
          {
            error: `Authentication failed (HTTP ${result.status}). Your cookies may be expired or invalid.`,
            status: result.status,
            detail: result.body,
          },
          { status: result.status }
        );
      }

      if (result.status === 404) {
        // This queryId is stale — invalidate cache if it was the live-scraped one
        if (queryId === cachedQueryId) {
          cachedQueryId = null;
          cacheTimestamp = 0;
        }
        errors.push({ queryId, status: result.status, body: result.body });
        continue;
      }

      if (result.status === 429) {
        return NextResponse.json(
          { error: 'Rate limited by X. Wait before retrying.', status: 429, detail: result.body },
          { status: 429 }
        );
      }

      errors.push({ queryId, status: result.status, body: result.body });
    } catch (err) {
      errors.push({ queryId, status: 0, body: String(err) });
    }
  }

  return NextResponse.json(
    {
      error:
        'All CreateTweet query IDs failed. X may have rotated the queryId or your session is invalid.',
      attempts: errors,
    },
    { status: 502 }
  );
}
