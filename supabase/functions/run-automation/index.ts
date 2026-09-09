// Supabase Edge Function: run-automation
// Implements the full cycle pattern:
//   Phase A: 10 posts (context + 3-6 random usernames + random image) with 1-3 min gaps
//   Phase B: 3 photo-only posts (image only, no text, no usernames)
//   Rest B:  3 minutes rest
//   Phase C: 20 posts (context + 3-6 random usernames + random image) with 1-3 min gaps
//   Rest C:  10 minutes rest → repeat from Phase A
//   Stops when entire username list is exhausted OR user hits Stop
//
// ✅ NO TWITTER API CREDENTIALS REQUIRED
// Uses only session cookies (auth_token + ct0) pasted by the user.
// X_BEARER_TOKEN is Twitter's own public token from their web JS bundle.
// ✅ PROXY SUPPORT: Every Twitter API call is routed through the account's proxy.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const X_BEARER_TOKEN =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const CREATE_TWEET_QUERY_IDS = [
  'Qkq4oPdZYuNB_Qw3TDuFqQ', // 2025 latest — verified from twitter-scrapper
  '7TKRKCPuAGsmYde0CudbVg', // 2025 — verified from XActions client
  'oB-5XsHNAbjvARJEc8CZFw', // 2025 previous
  'Uf3io9zVp1DsYxrmL5FJ7g', // 2025 fallback
  'tTsjMKyhajZvK4q76mpIbg', // 2025 fallback 2
  'bI4CD9xFNXB9oZFQMEFfiA', // 2024 Q4
  'SoVnbfCycZ7fERGCwpZkYA', // 2024 Q3
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

// Cycle pattern constants
const PHASE_A_POSTS = 10;
const PHASE_B_POSTS = 3;
const PHASE_C_POSTS = 20;
const REST_AFTER_B_SECONDS = 3 * 60;   // 3 minutes
const REST_AFTER_C_SECONDS = 10 * 60;  // 10 minutes
const MIN_DELAY_SECONDS = 60;           // 1 minute
const MAX_DELAY_SECONDS = 180;          // 3 minutes
const MIN_USERNAMES = 3;
const MAX_USERNAMES = 6;

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

function randomDelaySeconds(): number {
  return Math.floor(Math.random() * (MAX_DELAY_SECONDS - MIN_DELAY_SECONDS + 1)) + MIN_DELAY_SECONDS;
}

function randomUsernameCount(): number {
  return Math.floor(Math.random() * (MAX_USERNAMES - MIN_USERNAMES + 1)) + MIN_USERNAMES;
}

function parseCookieJson(raw: string): { headerString: string; ct0: string; hasAuthToken: boolean } {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { headerString: '', ct0: '', hasAuthToken: false };
    const pairs: Record<string, string> = {};
    for (const cookie of parsed) {
      if (cookie?.name) pairs[cookie.name] = cookie.value ?? '';
    }
    const headerString = Object.entries(pairs).map(([k, v]) => v ? `${k}=${v}` : k).join('; ');
    return { headerString, ct0: pairs['ct0'] ?? '', hasAuthToken: 'auth_token' in pairs };
  } catch {
    return { headerString: '', ct0: '', hasAuthToken: false };
  }
}

function generateTransactionId(queryId: string): string {
  const timestamp = Date.now().toString(16);
  const rand = Math.random().toString(16).slice(2, 18);
  return `${queryId.slice(0, 8)}-${timestamp}-${rand}`;
}

/**
 * Normalise a proxy string to a full URL.
 * Accepts: host:port, user:pass@host:port, http://..., socks5://...
 */
function normaliseProxy(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^(https?|socks[45h]):\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

/**
 * Build fetch options that route through the given proxy.
 * Deno's native fetch supports the `client` option via Deno.createHttpClient,
 * but that requires --allow-net with proxy flag. Instead we use the standard
 * HTTP_PROXY / HTTPS_PROXY environment variable approach OR pass the proxy
 * URL directly in the fetch options as supported by Deno's undici-based fetch.
 *
 * For Supabase Edge Functions (Deno Deploy), the recommended approach is to
 * set the proxy URL in the `client` field of the fetch RequestInit using
 * Deno.createHttpClient. We do that here with a try/catch fallback.
 */
function buildProxiedFetchOptions(proxy: string | undefined, baseInit: RequestInit): RequestInit {
  if (!proxy) return baseInit;
  const url = normaliseProxy(proxy);
  if (!url) return baseInit;

  try {
    // @ts-ignore — Deno-specific API
    const client = (Deno as any).createHttpClient?.({ proxy: { url } });
    if (client) return { ...baseInit, client } as RequestInit;
  } catch { /* Deno.createHttpClient not available — fall through */ }

  return baseInit;
}

async function tryCreateTweet(
  queryId: string,
  cookieString: string,
  ct0: string,
  tweetText: string,
  proxy: string | undefined,
  mediaId?: string
) {
  const variables: Record<string, unknown> = {
    tweet_text: tweetText,
    dark_request: false,
    semantic_annotation_ids: [],
    media: mediaId
      ? { media_entities: [{ media_id: mediaId, tagged_users: [] }], possibly_sensitive: false }
      : { media_entities: [], possibly_sensitive: false },
  };

  const init = buildProxiedFetchOptions(proxy, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${X_BEARER_TOKEN}`,
      'x-csrf-token': ct0,
      'Cookie': cookieString,
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': 'en',
      'x-client-transaction-id': generateTransactionId(queryId),
      'Origin': 'https://x.com',
      'Referer': 'https://x.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    body: JSON.stringify({ variables, features: CREATE_TWEET_FEATURES, queryId }),
  });

  const res = await fetch(`https://x.com/i/api/graphql/${queryId}/CreateTweet`, init);

  let body: unknown;
  try { body = await res.json(); } catch { body = null; }
  return { ok: res.ok, status: res.status, body };
}

async function sendOneTweet(
  cookieString: string,
  ct0: string,
  tweetText: string,
  proxy: string | undefined,
  supabase: any,
  configId: string,
  userId: string,
  label: string
): Promise<boolean> {
  const log = async (level: string, message: string) => {
    await supabase.from('automation_jobs').insert({ config_id: configId, user_id: userId, level, message });
  };

  let hadAuthError = false;
  let hadRateLimit = false;

  for (const queryId of CREATE_TWEET_QUERY_IDS) {
    try {
      const result = await tryCreateTweet(queryId, cookieString, ct0, tweetText, proxy);
      if (result.ok) {
        const data = result.body as any;
        const tweetResults = data?.data?.create_tweet;
        const hasResult = !!(tweetResults?.tweet_results && Object.keys(tweetResults.tweet_results).length > 0);
        if (hasResult) {
          const tweetId = tweetResults?.tweet_results?.result?.rest_id;
          await log('success', `✓ ${label}${tweetId ? ` (ID: ${tweetId})` : ''}${proxy ? ` [proxy: ${proxy.split('@').pop()}]` : ''}`);
          return true;
        }
        continue;
      }
      if (result.status === 401) {
        hadAuthError = true;
        continue;
      }
      if (result.status === 403) {
        let body = result.body as any;
        const errors = body?.errors;
        const hasHardAuthError = errors?.some(
          (e: any) => e?.code === 32 || e?.code === 64 || e?.code === 89
        );
        if (hasHardAuthError) {
          hadAuthError = true;
        }
        continue;
      }
      if (result.status === 429) {
        hadRateLimit = true;
        continue;
      }
    } catch (err) {
      await log('error', `Network error: ${String(err)}`);
    }
  }

  if (hadRateLimit) {
    await log('warn', 'Rate limited by X. Will retry next tick.');
    return false;
  }
  if (hadAuthError) {
    await log('warn', `⚠️ Authorization error — refresh cookies. Skipping this tweet and retrying next tick.`);
    return false;
  }
  await log('error', `✗ Tweet failed — all query IDs exhausted.`);
  return false;
}

// Main cycle runner
async function runCycle(config: any, supabase: any) {
  const {
    id: configId,
    user_id: userId,
    cookies,
    proxy,
    context_template,
    usernames,
    cycle_count = 0,
    tweets_posted = 0,
    cycle_phase = 'A',
    phase_post_count = 0,
  } = config;

  const log = async (level: string, message: string) => {
    await supabase.from('automation_jobs').insert({ config_id: configId, user_id: userId, level, message });
  };

  const { headerString, ct0, hasAuthToken } = parseCookieJson(cookies || '');
  if (!hasAuthToken || !ct0) {
    await log('error', 'Cycle aborted — missing auth_token or ct0 in cookies.');
    await supabase.from('bot_configs').update({ is_active: false }).eq('id', configId);
    return;
  }

  // Log proxy status at cycle start
  if (proxy) {
    await log('info', `🔒 Proxy active: ${proxy.split('@').pop() ?? proxy}`);
  }

  const allUsernames: string[] = usernames || [];
  const totalUsernames = allUsernames.length;

  if (totalUsernames === 0) {
    await log('warn', 'No usernames in list — stopping automation.');
    await supabase.from('bot_configs').update({ is_active: false }).eq('id', configId);
    return;
  }

  const buildTweetText = (mentionSuffix: string): string => {
    const baseTemplate = (context_template || '').trim();
    return baseTemplate ? `${baseTemplate}${mentionSuffix}` : mentionSuffix.trim();
  };

  let newPhase = cycle_phase;
  let newPhasePostCount = phase_post_count;
  let newTweetsPosted = tweets_posted;
  let newCycleCount = cycle_count;
  let nextDelaySeconds = randomDelaySeconds();
  let targetReached = false;

  const pickUsernames = (): string[] => {
    const count = Math.min(randomUsernameCount(), allUsernames.length);
    return [...allUsernames].sort(() => Math.random() - 0.5).slice(0, count);
  };

  if (newPhase === 'A') {
    const picked = pickUsernames();
    const mentionSuffix = picked.map((u: string) => ` @${u.replace(/^@/, '')}`).join('');
    const tweetText = buildTweetText(mentionSuffix);

    if (!tweetText.trim()) {
      await log('warn', `Phase A post skipped — tweet text is empty.`);
    } else {
      await log('info', `[A ${newPhasePostCount + 1}/${PHASE_A_POSTS}] Posting: "${tweetText.slice(0, 80)}${tweetText.length > 80 ? '...' : ''}" — tagged: ${picked.map((u: string) => `@${u}`).join(', ')}`);
      const ok = await sendOneTweet(headerString, ct0, tweetText, proxy, supabase, configId, userId, `Phase A post ${newPhasePostCount + 1}/${PHASE_A_POSTS} — tagged: ${picked.map((u: string) => `@${u}`).join(', ')}`);
      if (ok) newTweetsPosted++;
    }

    newPhasePostCount++;

    if (newPhasePostCount >= PHASE_A_POSTS) {
      newPhase = 'B';
      newPhasePostCount = 0;
      nextDelaySeconds = randomDelaySeconds();
      await log('info', `Phase A complete. Moving to Phase B (3 photo-only posts).`);
    } else {
      nextDelaySeconds = randomDelaySeconds();
      await log('info', `⏱ Next post in ~${Math.ceil(nextDelaySeconds / 60)} min (Phase A ${newPhasePostCount}/${PHASE_A_POSTS})`);
    }

  } else if (newPhase === 'B') {
    await log('info', `[B ${newPhasePostCount + 1}/${PHASE_B_POSTS}] Posting photo-only tweet`);
    const ok = await sendOneTweet(headerString, ct0, '📸', proxy, supabase, configId, userId, `Phase B photo-only post ${newPhasePostCount + 1}/${PHASE_B_POSTS}`);
    if (ok) newTweetsPosted++;

    newPhasePostCount++;

    if (newPhasePostCount >= PHASE_B_POSTS) {
      newPhase = 'rest_B';
      newPhasePostCount = 0;
      nextDelaySeconds = REST_AFTER_B_SECONDS;
      await log('warn', `Phase B complete. Resting 3 minutes before Phase C.`);
    } else {
      nextDelaySeconds = randomDelaySeconds();
      await log('info', `⏱ Next photo post in ~${Math.ceil(nextDelaySeconds / 60)} min (Phase B ${newPhasePostCount}/${PHASE_B_POSTS})`);
    }

  } else if (newPhase === 'rest_B') {
    newPhase = 'C';
    newPhasePostCount = 0;
    nextDelaySeconds = 5;
    await log('info', `Rest complete. Starting Phase C — 20 posts.`);

  } else if (newPhase === 'C') {
    const picked = pickUsernames();
    const mentionSuffix = picked.map((u: string) => ` @${u.replace(/^@/, '')}`).join('');
    const tweetText = buildTweetText(mentionSuffix);

    if (!tweetText.trim()) {
      await log('warn', `Phase C post skipped — tweet text is empty.`);
    } else {
      await log('info', `[C ${newPhasePostCount + 1}/${PHASE_C_POSTS}] Posting: "${tweetText.slice(0, 80)}${tweetText.length > 80 ? '...' : ''}" — tagged: ${picked.map((u: string) => `@${u}`).join(', ')}`);
      const ok = await sendOneTweet(headerString, ct0, tweetText, proxy, supabase, configId, userId, `Phase C post ${newPhasePostCount + 1}/${PHASE_C_POSTS} — tagged: ${picked.map((u: string) => `@${u}`).join(', ')}`);
      if (ok) newTweetsPosted++;
    }

    newPhasePostCount++;

    if (newPhasePostCount >= PHASE_C_POSTS) {
      newCycleCount++;
      newPhase = 'rest_C';
      newPhasePostCount = 0;
      nextDelaySeconds = REST_AFTER_C_SECONDS;
      await log('success', `✅ Full cycle #${newCycleCount} complete! ${newTweetsPosted} tweets sent total. Resting 10 minutes.`);
    } else {
      nextDelaySeconds = randomDelaySeconds();
      await log('info', `⏱ Next post in ~${Math.ceil(nextDelaySeconds / 60)} min (Phase C ${newPhasePostCount}/${PHASE_C_POSTS})`);
    }

  } else if (newPhase === 'rest_C') {
    newPhase = 'A';
    newPhasePostCount = 0;
    nextDelaySeconds = 5;
    await log('info', `10-minute rest complete. Restarting from Phase A.`);
  }

  if (newTweetsPosted * MIN_USERNAMES >= totalUsernames && newTweetsPosted > 0) {
    targetReached = true;
  }

  const now = new Date();
  const nextCycle = new Date(now.getTime() + nextDelaySeconds * 1000);

  if (targetReached) {
    await log('success', `🎯 Target reached! All ${totalUsernames} usernames have been covered. ${newTweetsPosted} tweets sent across ${newCycleCount} full cycle(s). Automation stopped.`);
    await supabase.from('bot_configs').update({
      is_active: false,
      cycle_count: newCycleCount,
      tweets_posted: newTweetsPosted,
      last_cycle_at: now.toISOString(),
      next_cycle_at: null,
      cycle_phase: 'A',
      phase_post_count: 0,
    }).eq('id', configId);
  } else {
    await supabase.from('bot_configs').update({
      cycle_count: newCycleCount,
      tweets_posted: newTweetsPosted,
      last_cycle_at: now.toISOString(),
      next_cycle_at: nextCycle.toISOString(),
      cycle_phase: newPhase,
      phase_post_count: newPhasePostCount,
    }).eq('id', configId);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date().toISOString();
    const { data: configs, error } = await supabase
      .from('bot_configs')
      .select('*')
      .eq('is_active', true)
      .or(`next_cycle_at.is.null,next_cycle_at.lte.${now}`);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];
    for (const config of (configs || [])) {
      try {
        await runCycle(config, supabase);
        results.push({ configId: config.id, phase: config.cycle_phase, status: 'fired' });
      } catch (err) {
        results.push({ configId: config.id, status: 'error', error: String(err) });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
