import { NextRequest, NextResponse } from 'next/server';

interface TweetRequestBody {
  tweetText: string;
  imageDataUrl?: string;
  // OAuth 2.0 user access token (from NextAuth session)
  accessToken?: string;
  // Legacy cookie-based auth (kept as fallback)
  cookieString?: string;
  ct0?: string;
}

/**
 * Upload a single image to X's media upload endpoint using OAuth 2.0 user token.
 */
async function uploadMediaOAuth(
  accessToken: string,
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
        'Authorization': `Bearer ${accessToken}`,
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

/**
 * Post a tweet using Twitter API v2 with OAuth 2.0 user access token.
 */
async function postTweetWithOAuth(
  accessToken: string,
  tweetText: string,
  mediaId?: string
): Promise<{ ok: boolean; status: number; body: unknown }> {
  let payload: Record<string, unknown> = { text: tweetText };
  if (mediaId) {
    payload.media = { media_ids: [mediaId] };
  }

  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => '(no body)');
  }

  return { ok: res.ok, status: res.status, body };
}

// ── Legacy cookie-based helpers (kept for backward compat) ────────────────────

const X_BEARER_TOKEN =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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

async function postTweetV1(
  cookieString: string,
  ct0: string,
  tweetText: string,
  mediaId?: string
): Promise<{ ok: boolean; status: number; body: unknown; newCt0?: string }> {
  const params = new URLSearchParams();
  params.set('status', tweetText);
  params.set('include_entities', '1');
  if (mediaId) params.set('media_ids', mediaId);

  const res = await fetch('https://api.twitter.com/1.1/statuses/update.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${X_BEARER_TOKEN}`,
      'x-csrf-token': ct0,
      'Cookie': cookieString,
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': 'en',
      'Origin': 'https://x.com',
      'Referer': 'https://x.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    body: params.toString(),
  });

  let newCt0: string | undefined;
  const setCookieHeader = res.headers.get('set-cookie');
  if (setCookieHeader) {
    const ct0Match = setCookieHeader.match(/(?:^|,\s*)ct0=([^;,]+)/i);
    if (ct0Match) newCt0 = ct0Match[1];
  }

  let body: unknown;
  try { body = await res.json(); } catch { body = await res.text().catch(() => '(no body)'); }
  return { ok: res.ok, status: res.status, body, newCt0 };
}

async function postTweetV2(
  cookieString: string,
  ct0: string,
  tweetText: string,
  mediaId?: string
): Promise<{ ok: boolean; status: number; body: unknown; newCt0?: string }> {
  let payload: Record<string, unknown> = { text: tweetText };
  if (mediaId) payload.media = { media_ids: [mediaId] };

  const res = await fetch('https://api.twitter.com/2/tweets', {
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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(payload),
  });

  let newCt0: string | undefined;
  const setCookieHeader = res.headers.get('set-cookie');
  if (setCookieHeader) {
    const ct0Match = setCookieHeader.match(/(?:^|,\s*)ct0=([^;,]+)/i);
    if (ct0Match) newCt0 = ct0Match[1];
  }

  let body: unknown;
  try { body = await res.json(); } catch { body = await res.text().catch(() => '(no body)'); }
  return { ok: res.ok, status: res.status, body, newCt0 };
}

async function postTweetGraphQL(
  cookieString: string,
  ct0: string,
  tweetText: string,
  mediaId?: string
): Promise<{ ok: boolean; status: number; body: unknown; newCt0?: string }> {
  const variables: Record<string, unknown> = {
    tweet_text: tweetText,
    dark_request: false,
    media: {
      media_entities: mediaId ? [{ media_id: mediaId, tagged_users: [] }] : [],
      possibly_sensitive: false,
    },
    semantic_annotation_ids: [],
  };

  const features = {
    tweetypie_unmention_optimization_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: false,
    tweet_awards_web_tipping_enabled: false,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    responsive_web_media_download_video_enabled: false,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_enhance_cards_enabled: false,
  };

  const res = await fetch(
    'https://twitter.com/i/api/graphql/SoVnbfCycZ7fERGCwpZkYA/CreateTweet',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${X_BEARER_TOKEN}`,
        'x-csrf-token': ct0,
        'Cookie': cookieString,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-client-language': 'en',
        'Origin': 'https://twitter.com',
        'Referer': 'https://twitter.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ variables, features }),
    }
  );

  let newCt0: string | undefined;
  const setCookieHeader = res.headers.get('set-cookie');
  if (setCookieHeader) {
    const ct0Match = setCookieHeader.match(/(?:^|,\s*)ct0=([^;,]+)/i);
    if (ct0Match) newCt0 = ct0Match[1];
  }

  let body: unknown;
  try { body = await res.json(); } catch { body = await res.text().catch(() => '(no body)'); }

  const bodyObj = body as Record<string, unknown>;
  if (res.ok && bodyObj?.errors) {
    const errors = bodyObj.errors as Array<{ message?: string; code?: number }>;
    const authError = errors.find(e => e.code === 32 || e.code === 64 || e.code === 89 || e.code === 135 || e.code === 326);
    if (authError) return { ok: false, status: 401, body, newCt0 };
    return { ok: false, status: 400, body, newCt0 };
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

  const { tweetText, imageDataUrl, accessToken, cookieString, ct0 } = payload;

  if (!tweetText) {
    return NextResponse.json({ error: 'Missing required field: tweetText' }, { status: 400 });
  }

  // ── Path A: OAuth 2.0 user access token (preferred) ──────────────
  if (accessToken) {
    let mediaId: string | undefined;
    if (imageDataUrl) {
      mediaId = (await uploadMediaOAuth(accessToken, imageDataUrl)) ?? undefined;
    }

    const result = await postTweetWithOAuth(accessToken, tweetText, mediaId);

    if (result.ok) {
      const data = result.body as Record<string, unknown>;
      const tweetData = data?.data as { id?: string } | undefined;
      return NextResponse.json({
        success: true,
        api: 'oauth2',
        tweetId: tweetData?.id ?? null,
        mediaId: mediaId ?? null,
        data: result.body,
      });
    }

    // If OAuth token is invalid/expired, return auth error
    if (result.status === 401 || result.status === 403) {
      return NextResponse.json(
        { error: 'OAuth token expired or invalid. Please sign in with Twitter again.', status: result.status, detail: result.body },
        { status: result.status }
      );
    }

    return NextResponse.json(
      { error: `Tweet failed with OAuth: HTTP ${result.status}`, detail: result.body },
      { status: 502 }
    );
  }

  // ── Path B: Legacy cookie-based auth (fallback) ───────────────────
  if (!cookieString || !ct0) {
    return NextResponse.json(
      { error: 'Missing required fields: either accessToken (OAuth) or cookieString + ct0 (legacy)' },
      { status: 400 }
    );
  }

  let mediaId: string | undefined;
  if (imageDataUrl) {
    mediaId = (await uploadMedia(cookieString, ct0, imageDataUrl)) ?? undefined;
  }

  // Attempt 1: v1.1
  try {
    const v1Result = await postTweetV1(cookieString, ct0, tweetText, mediaId);
    if (v1Result.ok) {
      const data = v1Result.body as Record<string, unknown>;
      return NextResponse.json({ success: true, api: 'v1.1', tweetId: (data?.id_str as string) ?? null, mediaId: mediaId ?? null, newCt0: v1Result.newCt0 ?? null, data: v1Result.body });
    }
    if (v1Result.status === 401 || v1Result.status === 403) {
      console.warn(`[tweet/route] v1.1 auth failure (${v1Result.status}), falling through to v2`);
    }
  } catch (err) {
    console.error('[tweet/route] v1.1 threw:', err);
  }

  // Attempt 2: v2
  try {
    const v2Result = await postTweetV2(cookieString, ct0, tweetText, mediaId);
    if (v2Result.ok) {
      const data = v2Result.body as Record<string, unknown>;
      const tweetData = data?.data as { id?: string } | undefined;
      return NextResponse.json({ success: true, api: 'v2', tweetId: tweetData?.id ?? null, mediaId: mediaId ?? null, newCt0: v2Result.newCt0 ?? null, data: v2Result.body });
    }
    if (v2Result.status === 401 || v2Result.status === 403) {
      console.warn(`[tweet/route] v2 auth failure (${v2Result.status}), falling through to GraphQL`);
    }
  } catch (err) {
    console.error('[tweet/route] v2 threw:', err);
  }

  // Attempt 3: GraphQL
  try {
    const gqlResult = await postTweetGraphQL(cookieString, ct0, tweetText, mediaId);
    if (gqlResult.ok) {
      const data = gqlResult.body as Record<string, unknown>;
      let tweetId: string | null = null;
      try {
        const createTweet = (data?.data as Record<string, unknown>)?.create_tweet as Record<string, unknown>;
        const tweetResults = createTweet?.tweet_results as Record<string, unknown>;
        const result = tweetResults?.result as Record<string, unknown>;
        const legacy = result?.legacy as Record<string, unknown>;
        tweetId = (legacy?.id_str as string) ?? null;
      } catch { /* ignore */ }
      return NextResponse.json({ success: true, api: 'graphql', tweetId, mediaId: mediaId ?? null, newCt0: gqlResult.newCt0 ?? null, data: gqlResult.body });
    }
    return NextResponse.json(
      { error: `Authentication failed after 3 attempts (v1.1, v2, GraphQL). Your cookies may be expired — paste fresh cookies from Cookie-Editor and try again.`, status: gqlResult.status, detail: gqlResult.body },
      { status: gqlResult.status === 401 || gqlResult.status === 403 ? gqlResult.status : 502 }
    );
  } catch (err) {
    return NextResponse.json({ error: `All tweet attempts failed: ${String(err)}` }, { status: 502 });
  }
}
