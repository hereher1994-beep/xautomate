import { NextRequest, NextResponse } from 'next/server';

// X's hardcoded public bearer token (shipped in their web JS bundle)
const X_BEARER_TOKEN =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

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

/**
 * Post a tweet using X's v1.1 REST API (statuses/update).
 * This endpoint does NOT use rotating GraphQL queryIds and is more stable.
 */
async function postTweetV1(
  cookieString: string,
  ct0: string,
  tweetText: string,
  mediaId?: string
): Promise<{ ok: boolean; status: number; body: unknown; newCt0?: string }> {
  const params = new URLSearchParams();
  params.set('status', tweetText);
  params.set('include_entities', '1');
  if (mediaId) {
    params.set('media_ids', mediaId);
  }

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
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    body: params.toString(),
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

/**
 * Fallback: post tweet using X's v2 REST API (tweets endpoint).
 */
async function postTweetV2(
  cookieString: string,
  ct0: string,
  tweetText: string,
  mediaId?: string
): Promise<{ ok: boolean; status: number; body: unknown; newCt0?: string }> {
  let payload: Record<string, unknown> = { text: tweetText };
  if (mediaId) {
    payload.media = { media_ids: [mediaId] };
  }

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
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    body: JSON.stringify(payload),
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

  // ── Attempt 1: v1.1 REST API (statuses/update) ────────────────────
  try {
    const v1Result = await postTweetV1(cookieString, ct0, tweetText, mediaId);

    if (v1Result.ok) {
      const data = v1Result.body as Record<string, unknown>;
      const tweetId = (data?.id_str as string) ?? null;
      return NextResponse.json({
        success: true,
        api: 'v1.1',
        tweetId,
        mediaId: mediaId ?? null,
        newCt0: v1Result.newCt0 ?? null,
        data: v1Result.body,
      });
    }

    // Hard auth failure — no point trying v2
    if (v1Result.status === 401 || v1Result.status === 403) {
      return NextResponse.json(
        {
          error: `Authentication failed (HTTP ${v1Result.status}). Your cookies may be expired or invalid.`,
          status: v1Result.status,
          detail: v1Result.body,
        },
        { status: v1Result.status }
      );
    }
  } catch (err) {
    // v1.1 threw — fall through to v2
    console.error('[tweet/route] v1.1 threw:', err);
  }

  // ── Attempt 2: v2 REST API (tweets) ──────────────────────────────
  try {
    const v2Result = await postTweetV2(cookieString, ct0, tweetText, mediaId);

    if (v2Result.ok) {
      const data = v2Result.body as Record<string, unknown>;
      const tweetData = data?.data as { id?: string } | undefined;
      const tweetId = tweetData?.id ?? null;
      return NextResponse.json({
        success: true,
        api: 'v2',
        tweetId,
        mediaId: mediaId ?? null,
        newCt0: v2Result.newCt0 ?? null,
        data: v2Result.body,
      });
    }

    if (v2Result.status === 401 || v2Result.status === 403) {
      return NextResponse.json(
        {
          error: `Authentication failed (HTTP ${v2Result.status}). Your cookies may be expired or invalid.`,
          status: v2Result.status,
          detail: v2Result.body,
        },
        { status: v2Result.status }
      );
    }

    return NextResponse.json(
      {
        error: `Tweet failed (HTTP ${v2Result.status}). Check your session cookies and try again.`,
        status: v2Result.status,
        detail: v2Result.body,
      },
      { status: 502 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Tweet request failed: ${String(err)}` },
      { status: 502 }
    );
  }
}
