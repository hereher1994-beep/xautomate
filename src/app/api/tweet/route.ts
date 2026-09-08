import { NextRequest, NextResponse } from 'next/server';

interface TweetRequestBody {
  cookieString: string;
  ct0: string;
  tweetText: string;
  imageDataUrl?: string;
}

/**
 * Extract a specific cookie value by name from a cookie string.
 * Handles both "name=value; name2=value2" and JSON array formats.
 */
function extractCookieValue(cookieString: string, name: string): string | null {
  // JSON array format (Cookie-Editor export)
  if (cookieString.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(cookieString) as Array<{ name: string; value: string }>;
      const found = arr.find((c) => c.name === name);
      return found?.value ?? null;
    } catch {
      // fall through
    }
  }

  // Standard "name=value; name2=value2" format
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
 * Handles both JSON array and plain string inputs.
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
  // Already in header format — return as-is (strip extra whitespace)
  return cookieString
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('; ');
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

  // Extract ct0 (CSRF token) — it must come from the cookies themselves
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

  // ── Attempt 1: Twitter v1.1 REST API (most reliable with cookie auth) ──
  try {
    let result = await postViaV1(cookieHeader, ct0, tweetText, imageDataUrl);
    if (result.success) {
      return NextResponse.json({
        success: true,
        method: 'v1',
        tweetId: result.tweetId,
        message: 'Tweet posted successfully',
      });
    }
    // If v1 returned a specific auth error, bail immediately
    if (result.authError) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    console.warn('[tweet] v1 failed, trying GraphQL:', result.error);
  } catch (e) {
    console.warn('[tweet] v1 exception, trying GraphQL:', e);
  }

  // ── Attempt 2: GraphQL CreateTweet (fallback) ──
  try {
    let result = await postViaGraphQL(cookieHeader, ct0, tweetText);
    if (result.success) {
      return NextResponse.json({
        success: true,
        method: 'graphql',
        tweetId: result.tweetId,
        message: 'Tweet posted successfully',
      });
    }
    if (result.authError) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    return NextResponse.json({ error: result.error ?? 'Both tweet methods failed' }, { status: 500 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Tweet failed: ${msg}` }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Method 1: Twitter v1.1 statuses/update
// ─────────────────────────────────────────────────────────────────────────────
async function postViaV1(
  cookieHeader: string,
  ct0: string,
  tweetText: string,
  imageDataUrl?: string
): Promise<{ success: boolean; tweetId?: string; error?: string; authError?: boolean }> {
  const body = new URLSearchParams();
  body.set('status', tweetText);
  body.set('tweet_mode', 'extended');

  // Handle image upload if provided
  if (imageDataUrl) {
    try {
      const mediaId = await uploadMediaV1(cookieHeader, ct0, imageDataUrl);
      if (mediaId) {
        body.set('media_ids', mediaId);
      }
    } catch (e) {
      console.warn('[tweet/v1] Image upload failed, posting without image:', e);
    }
  }

  const res = await fetch('https://api.twitter.com/1.1/statuses/update.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader,
      'X-Csrf-Token': ct0,
      Authorization:
        'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Referer: 'https://twitter.com/',
      Origin: 'https://twitter.com',
      'X-Twitter-Auth-Type': 'OAuth2Session',
      'X-Twitter-Client-Language': 'en',
      'X-Twitter-Active-User': 'yes',
    },
    body: body.toString(),
  });

  const text = await res.text();
  console.log(`[tweet/v1] status=${res.status} body=${text.slice(0, 300)}`);

  if (res.status === 401 || res.status === 403) {
    return {
      success: false,
      authError: true,
      error:
        'Session cookies are expired or invalid. Please export fresh cookies from x.com and paste them in the Session Cookies field.',
    };
  }

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json.errors?.[0]?.message) errMsg = json.errors[0].message;
    } catch {
      // ignore
    }
    return { success: false, error: errMsg };
  }

  try {
    const json = JSON.parse(text);
    return { success: true, tweetId: json.id_str ?? json.id };
  } catch {
    return { success: false, error: 'Could not parse v1 response' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Method 2: GraphQL CreateTweet
// ─────────────────────────────────────────────────────────────────────────────
async function postViaGraphQL(
  cookieHeader: string,
  ct0: string,
  tweetText: string
): Promise<{ success: boolean; tweetId?: string; error?: string; authError?: boolean }> {
  // This query ID is stable and has been consistent for years
  const QUERY_ID = 'SoVnbfCycZ7fERGCwpZkYA';

  const variables = {
    tweet_text: tweetText,
    dark_request: false,
    media: { media_entities: [], possibly_sensitive: false },
    semantic_annotation_ids: [],
  };

  const features = {
    communities_web_enable_tweet_community_results_fetch: true,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: false,
    tweet_awards_web_tipping_enabled: false,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    rweb_video_timestamps_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_enhance_cards_enabled: false,
  };

  const res = await fetch(
    `https://twitter.com/i/api/graphql/${QUERY_ID}/CreateTweet`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        'X-Csrf-Token': ct0,
        Authorization:
          'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: 'https://twitter.com/compose/tweet',
        Origin: 'https://twitter.com',
        'X-Twitter-Auth-Type': 'OAuth2Session',
        'X-Twitter-Client-Language': 'en',
        'X-Twitter-Active-User': 'yes',
        'X-Client-Transaction-Id': generateTransactionId(),
      },
      body: JSON.stringify({ variables, features, queryId: QUERY_ID }),
    }
  );

  const text = await res.text();
  console.log(`[tweet/graphql] status=${res.status} body=${text.slice(0, 400)}`);

  if (res.status === 401 || res.status === 403) {
    return {
      success: false,
      authError: true,
      error:
        'Session cookies are expired or invalid. Please export fresh cookies from x.com and paste them in the Session Cookies field.',
    };
  }

  if (!res.ok) {
    return { success: false, error: `GraphQL HTTP ${res.status}: ${text.slice(0, 200)}` };
  }

  try {
    const json = JSON.parse(text);
    // Check for GraphQL errors
    if (json.errors?.length) {
      let errMsg = json.errors[0]?.message ?? 'GraphQL error';
      const isAuth =
        errMsg.toLowerCase().includes('auth') ||
        errMsg.toLowerCase().includes('not authorized') ||
        json.errors[0]?.code === 32 ||
        json.errors[0]?.code === 64 ||
        json.errors[0]?.code === 89;
      return { success: false, authError: isAuth, error: errMsg };
    }

    const tweetResult =
      json?.data?.create_tweet?.tweet_results?.result ??
      json?.data?.createTweet?.tweet_results?.result;

    if (tweetResult?.rest_id) {
      return { success: true, tweetId: tweetResult.rest_id };
    }

    // If we got a 200 with no errors and no tweet result, still treat as success
    if (res.ok && !json.errors) {
      return { success: true };
    }

    return { success: false, error: 'Unexpected GraphQL response shape' };
  } catch {
    return { success: false, error: 'Could not parse GraphQL response' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Media upload via v1.1 (for image attachments)
// ─────────────────────────────────────────────────────────────────────────────
async function uploadMediaV1(
  cookieHeader: string,
  ct0: string,
  imageDataUrl: string
): Promise<string | null> {
  const base64Match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!base64Match) return null;

  const mimeType = base64Match[1];
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

  const json = await res.json();
  return json.media_id_string ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function generateTransactionId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < 80; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
