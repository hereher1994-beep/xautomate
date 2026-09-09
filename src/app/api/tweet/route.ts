import { NextRequest, NextResponse } from 'next/server';

// X's hardcoded public bearer token (shipped in their web JS bundle)
const X_BEARER_TOKEN =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

// Known CreateTweet query IDs (X rotates these; try in order)
const CREATE_TWEET_QUERY_IDS = [
  '5CdvsV_zjv4L64XFifAglw',
  'SoVnbfCycZ7fERGCwpZkYA',
  'tTsjMKyhajZvK4q76mpIbg',
  'a1p9RmpkLBFds-d3O44bWg',
  '7TKRKCPuAGsmYde0CudbVg',
];

const CREATE_TWEET_FEATURES = {
  interactive_text_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_text_conversations_enabled: false,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: false,
  vibe_api_enabled: false,
  rweb_lists_timeline_redesign_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_media_interstitial_enabled: false,
  responsive_web_enhance_cards_enabled: false,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled_v2: false,
  responsive_web_media_download_video_enabled: false,
  responsive_web_twitter_article_tweet_consumption_enabled: false,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled_v2: false,
  rweb_video_timestamps_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled_v2: true,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled_v2: true,
  responsive_web_graphql_exclude_directive_enabled_v2: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled_v2: false,
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

  // Try each known query ID in order until one succeeds
  const errors: { queryId: string; status: number; body: unknown }[] = [];

  for (const queryId of CREATE_TWEET_QUERY_IDS) {
    try {
      const result = await tryCreateTweet(queryId, cookieString, ct0, tweetText, mediaId);

      if (result.ok) {
        const data = result.body as Record<string, unknown>;
        if (data?.errors && Array.isArray(data.errors) && data.errors.length > 0) {
          errors.push({ queryId, status: result.status, body: result.body });
          continue;
        }
        return NextResponse.json({
          success: true,
          queryId,
          mediaId: mediaId ?? null,
          // Return the new ct0 if X rotated it, so the client can save it back
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
        errors.push({ queryId, status: result.status, body: result.body });
        continue;
      }

      errors.push({ queryId, status: result.status, body: result.body });
    } catch (err) {
      errors.push({ queryId, status: 0, body: String(err) });
    }
  }

  return NextResponse.json(
    {
      error: 'All CreateTweet query IDs failed. X may have rotated the queryId or your session is invalid.',
      attempts: errors,
    },
    { status: 502 }
  );
}
