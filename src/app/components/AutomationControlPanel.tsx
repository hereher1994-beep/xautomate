'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import StatusBar from './StatusBar';
import ProxyConfigCard from './ProxyConfigCard';
import SessionCookiesCard from './SessionCookiesCard';
import ContextTemplateCard from './ContextTemplateCard';
import UsernameListManager from './UsernameListManager';
import ImageAttachmentManager from './ImageAttachmentManager';
import CycleControlCard from './CycleControlCard';
import ActivityLog from './ActivityLog';
import OpenRouterKeyCard from './OpenRouterKeyCard';
import { parseCookieJson } from '../types/automation';
import { createClient } from '@/lib/supabase/client';
import { AutomationStatus } from '@/app/types/automation';


// ── localStorage keys ──────────────────────────────────────────────
const LS_PROXY = 'xautomate_proxy';
const LS_COOKIES = 'xautomate_cookies';
const LS_CONTEXT = 'xautomate_context';
const LS_USERNAMES = 'xautomate_usernames';
const LS_IMAGES = 'xautomate_images';
const LS_OPENROUTER_KEY = 'xautomate_openrouter_key';

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded or private mode — silently ignore
  }
}

const INITIAL_LOG: LogEntry[] = [
  {
    id: 'log-init-001',
    timestamp: '2026-09-06 14:23:20',
    level: 'info',
    message: 'XAutomate initialized. Configure settings and press Start to begin.',
  },
];

// Cycle pattern constants
const PHASE_A_POSTS = 10;   // First batch: 10 posts with context + usernames + image
const PHASE_B_POSTS = 3;    // Photo-only posts (no text, no usernames)
const PHASE_C_POSTS = 20;   // Second batch: 20 posts with context + usernames + image
const REST_AFTER_B_MS = 3 * 60 * 1000;   // 3 minutes rest after photo-only posts
const REST_AFTER_C_MS = 10 * 60 * 1000;  // 10 minutes rest after 20-post batch
const MIN_DELAY_MS = 1 * 60 * 1000;      // 1 minute minimum between posts
const MAX_DELAY_MS = 3 * 60 * 1000;      // 3 minutes maximum between posts
const MIN_USERNAMES = 3;
const MAX_USERNAMES = 6;

function randomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
}

function randomUsernameCount() {
  return Math.floor(Math.random() * (MAX_USERNAMES - MIN_USERNAMES + 1)) + MIN_USERNAMES;
}

export default function AutomationControlPanel() {
  // ── Core config state ──────────────────────────────────────────────
  const [proxy, setProxy] = useState(() => lsGet(LS_PROXY, ''));
  const [cookies, setCookies] = useState(() => lsGet(LS_COOKIES, ''));
  const [context, setContext] = useState(() => lsGet(LS_CONTEXT, ''));
  const [usernames, setUsernames] = useState<string[]>(() =>
    lsGet(LS_USERNAMES, ['elonmusk', 'sama', 'karpathy', 'naval', 'paulg'])
  );
  const [images, setImages] = useState<{ id: string; name: string; url: string; size: number }[]>(
    () => lsGet(LS_IMAGES, [])
  );
  const [openRouterKey, setOpenRouterKey] = useState(() => lsGet(LS_OPENROUTER_KEY, ''));

  // ── Hydration guard ────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Run state ──────────────────────────────────────────────────────
  const [status, setStatus] = useState<AutomationStatus>('idle');
  const [cycleCount, setCycleCount] = useState(0);
  const [tweetsPosted, setTweetsPosted] = useState(0);
  const [lastCycleTime, setLastCycleTime] = useState<string | null>(null);
  const [nextCycleIn, setNextCycleIn] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOG);
  const [isStarting, setIsStarting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [isServerMode, setIsServerMode] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupDone, setSetupDone] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // ── Cycle phase state (local browser mode) ─────────────────────────
  // phase: 'A' = 10-post batch, 'B' = photo-only, 'rest_B' = 3min rest, 'C' = 20-post batch, 'rest_C' = 10min rest
  const phaseRef = useRef<'A' | 'B' | 'rest_B' | 'C' | 'rest_C'>('A');
  const phasePostCountRef = useRef(0);  // posts done in current phase
  const usernameIndexRef = useRef(0);   // tracks how far through the username list we are
  const isRunningRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const pauseRef = useRef(false);

  const logPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cycleCountRef = useRef(cycleCount);
  cycleCountRef.current = cycleCount;
  const tweetsPostedRef = useRef(tweetsPosted);
  tweetsPostedRef.current = tweetsPosted;

  // ── Live refs so async loop always reads current state ─────────────
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const usernamesRef = useRef(usernames);
  usernamesRef.current = usernames;
  const contextRef = useRef(context);
  contextRef.current = context;
  const cookiesRef = useRef(cookies);
  cookiesRef.current = cookies;
  const openRouterKeyRef = useRef(openRouterKey);
  openRouterKeyRef.current = openRouterKey;
  const proxyRef = useRef(proxy);
  proxyRef.current = proxy;

  // ── AI tweet generator (OpenRouter, runs locally in browser) ──────
  const generateTweetWithAI = useCallback(async (contextTemplate: string): Promise<string | null> => {
    // Always re-read the OpenRouter key fresh from localStorage before every AI call
    // — never rely on stale React state or ref values
    const apiKey = (() => {
      try {
        const raw = localStorage.getItem(LS_OPENROUTER_KEY);
        return raw !== null ? (JSON.parse(raw) as string).trim() : openRouterKeyRef.current.trim();
      } catch {
        return openRouterKeyRef.current.trim();
      }
    })();
    if (!apiKey) return null;
    try {
      const res = await fetch('/api/ai/openrouter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          model: 'openai/gpt-4o-mini',
          temperature: 0.97,
          messages: [
            {
              role: 'system',
              content: `You are a tweet writer. The user has provided a context/rules template below. Write ONE unique tweet that follows those rules exactly. Output ONLY the tweet text — no quotes, no explanation, no hashtags unless the rules say so, no @mentions. There is NO character limit — write as much as the rules require.

RULES / CONTEXT:
${contextTemplate}`,
            },
            {
              role: 'user',
              content: 'Write a unique tweet following the rules above. Output only the tweet text.',
            },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { content?: string };
      const text = data.content?.trim() ?? '';
      // Strip any @mentions the AI may have snuck in
      return text.replace(/@\w+/g, '').replace(/\s{2,}/g, ' ').trim() || null;
    } catch {
      return null;
    }
  }, []);

  // ── Log helper ─────────────────────────────────────────────────────
  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const id = `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setLogs(prev => [{ id, timestamp, level, message }, ...prev].slice(0, 300));
  }, []);

  // ── Auto-save to localStorage on every change ─────────────────────
  useEffect(() => { lsSet(LS_PROXY, proxy); }, [proxy]);
  useEffect(() => { lsSet(LS_COOKIES, cookies); }, [cookies]);
  useEffect(() => { lsSet(LS_CONTEXT, context); }, [context]);
  useEffect(() => { lsSet(LS_USERNAMES, usernames); }, [usernames]);
  useEffect(() => { lsSet(LS_IMAGES, images); }, [images]);
  useEffect(() => { lsSet(LS_OPENROUTER_KEY, openRouterKey); }, [openRouterKey]);

  // ── Load config from Supabase on mount ────────────────────────────
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setIsLoadingConfig(false); return; }

        const res = await fetch('/api/automation');
        if (!res.ok) { setIsLoadingConfig(false); return; }
        const { config } = await res.json();

        if (config) {
          setConfigId(config.id);
          if (config.proxy) setProxy(config.proxy);
          if (config.cookies) setCookies(config.cookies);
          if (config.context_template) setContext(config.context_template);
          if (config.usernames?.length > 0) setUsernames(config.usernames);
          if (config.cycle_count) setCycleCount(config.cycle_count);
          if (config.tweets_posted) setTweetsPosted(config.tweets_posted);
          if (config.last_cycle_at) {
            const d = new Date(config.last_cycle_at);
            const pad = (n: number) => String(n).padStart(2, '0');
            setLastCycleTime(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
          }

          if (config.is_active) {
            setStatus('running');
            setIsServerMode(true);
            addLog('success', '🌐 Server-side automation is running. Bot is active 24/7 — browser not required.');
            if (config.next_cycle_at) {
              const secondsLeft = Math.max(0, Math.floor((new Date(config.next_cycle_at).getTime() - Date.now()) / 1000));
              setNextCycleIn(secondsLeft > 0 ? secondsLeft : 60);
            }
          }
        }
      } catch {
        // silently fail — local mode still works
      } finally {
        setIsLoadingConfig(false);
      }
    };
    loadConfig();
  }, [addLog]);

  // ── Poll server logs when in server mode ──────────────────────────
  const fetchServerLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/automation/logs');
      if (!res.ok) return;
      const { logs: serverLogs } = await res.json();
      if (!serverLogs?.length) return;

      const formatted: LogEntry[] = serverLogs.map((l: { id: string; level: string; message: string; created_at: string }) => {
        const d = new Date(l.created_at);
        const pad = (n: number) => String(n).padStart(2, '0');
        return {
          id: l.id,
          timestamp: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
          level: l.level as LogEntry['level'],
          message: `[Server] ${l.message}`,
        };
      });

      setLogs(prev => {
        const existingIds = new Set(prev.map(l => l.id));
        const newLogs = formatted.filter(l => !existingIds.has(l.id));
        if (newLogs.length === 0) return prev;
        return [...newLogs, ...prev].slice(0, 300);
      });

      const res2 = await fetch('/api/automation');
      if (res2.ok) {
        const { config } = await res2.json();
        if (config?.cycle_count != null) setCycleCount(config.cycle_count);
        if (config?.tweets_posted != null) setTweetsPosted(config.tweets_posted);
        if (config?.last_cycle_at) {
          const d = new Date(config.last_cycle_at);
          const pad = (n: number) => String(n).padStart(2, '0');
          setLastCycleTime(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
        }
        if (config?.next_cycle_at) {
          const secondsLeft = Math.max(0, Math.floor((new Date(config.next_cycle_at).getTime() - Date.now()) / 1000));
          setNextCycleIn(secondsLeft);
        }
        // Check if target reached (server stopped it)
        if (config && !config.is_active && isServerMode) {
          setStatus('idle');
          setIsServerMode(false);
          addLog('success', '🎯 Target reached! All usernames have been processed. Automation stopped.');
          toast.success('Target reached!', { description: 'All usernames have been processed.' });
        }
      }
    } catch {
      // silently fail
    }
  }, [isServerMode, addLog]);

  // ── Countdown timer helper ─────────────────────────────────────────
  const startCountdown = useCallback((seconds: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setNextCycleIn(seconds);
    countdownRef.current = setInterval(() => {
      setNextCycleIn(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Sleep helper that respects stop/pause ─────────────────────────
  const sleepInterruptible = useCallback(async (ms: number, label: string): Promise<boolean> => {
    const steps = Math.ceil(ms / 1000);
    startCountdown(Math.ceil(ms / 1000));
    for (let i = 0; i < steps; i++) {
      if (stopRequestedRef.current) return false;
      // Wait for unpause
      while (pauseRef.current && !stopRequestedRef.current) {
        await new Promise(r => setTimeout(r, 500));
      }
      if (stopRequestedRef.current) return false;
      await new Promise(r => setTimeout(r, 1000));
    }
    return true;
  }, [startCountdown]);

  // ── Send a single tweet ────────────────────────────────────────────
  const sendTweet = useCallback(async (tweetText: string, imageDataUrl?: string): Promise<boolean> => {
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const isRetry = attempt > 1;

      // Re-read cookies completely fresh from localStorage on every single attempt
      // — never reuse or cache session data between tweets or retries
      const rawCookies = (() => {
        try {
          const raw = localStorage.getItem(LS_COOKIES);
          return raw !== null ? JSON.parse(raw) as string : '';
        } catch {
          return cookiesRef.current;
        }
      })();
      // Re-read proxy fresh from localStorage on every attempt
      const freshProxy = (() => {
        try {
          const raw = localStorage.getItem(LS_PROXY);
          return raw !== null ? (JSON.parse(raw) as string) : proxyRef.current;
        } catch {
          return proxyRef.current;
        }
      })();
      const parsed = parseCookieJson(rawCookies);
      const ct0 = parsed.pairs['ct0'] ?? '';

      if (!parsed.hasAuthToken || !ct0) {
        addLog('error', 'Tweet aborted — missing auth_token or ct0 in cookies.');
        return false;
      }

      try {
        if (isRetry) {
          addLog('warn', `🔄 Retry ${attempt - 1}/${MAX_RETRIES - 1} — reading fresh cookies from localStorage and retrying tweet…`);
        }

        const res = await fetch('/api/tweet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cookieString: parsed.headerString,
            ct0,
            tweetText,
            ...(imageDataUrl ? { imageDataUrl } : {}),
            ...(freshProxy ? { proxy: freshProxy } : {}),
            forceRefresh: isRetry,
          }),
        });

        const data = await res.json() as Record<string, unknown>;

        if (res.ok && data.success) {
          // ── Update stored ct0 with the value X just rotated ──────────────
          // X issues a new ct0 on every successful request via Set-Cookie.
          // The API route captures it and returns it as `newCt0`.
          // We must write it back into the stored cookie JSON NOW — before the
          // next tweet fires — otherwise the next request sends the old ct0
          // and X rejects it (CSRF mismatch → 403 → "All query IDs failed").
          const newCt0 = data.newCt0 as string | null | undefined;
          if (newCt0) {
            try {
              const storedRaw = localStorage.getItem(LS_COOKIES);
              if (storedRaw !== null) {
                const storedCookieStr = JSON.parse(storedRaw) as string;
                // The stored value is a JSON string of Cookie-Editor format (array of objects)
                // Try to update the ct0 value inside the JSON array
                try {
                  const cookieArray = JSON.parse(storedCookieStr) as Array<{ name: string; value: string }>;
                  if (Array.isArray(cookieArray)) {
                    const idx = cookieArray.findIndex(c => c.name === 'ct0');
                    if (idx !== -1) {
                      cookieArray[idx] = { ...cookieArray[idx], value: newCt0 };
                    } else {
                      cookieArray.push({ name: 'ct0', value: newCt0 });
                    }
                    const updatedJson = JSON.stringify(cookieArray);
                    localStorage.setItem(LS_COOKIES, JSON.stringify(updatedJson));
                    // Also sync React state so the UI reflects the new ct0
                    setCookies(updatedJson);
                  }
                } catch {
                  // Stored value is a plain cookie header string, not JSON array
                  // Replace ct0=... in the string directly
                  let updated = storedCookieStr;
                  if (/(?:^|;\s*)ct0=/.test(updated)) {
                    updated = updated.replace(/((?:^|;\s*))ct0=[^;]*/i, `$1ct0=${newCt0}`);
                  } else {
                    updated = `${updated}; ct0=${newCt0}`;
                  }
                  localStorage.setItem(LS_COOKIES, JSON.stringify(updated));
                  setCookies(updated);
                }
              }
            } catch {
              // Non-critical — log silently, tweet already succeeded
            }
          }

          const tweetData = data.data as { data?: { create_tweet?: { tweet_results?: { result?: { rest_id?: string } } } } } | undefined;
          const tweetId = tweetData?.data?.create_tweet?.tweet_results?.result?.rest_id;
          if (isRetry) {
            addLog('success', `✓ Tweet sent on retry ${attempt - 1} (ID: ${tweetId ?? 'n/a'})${imageDataUrl ? ' + image' : ''}`);
          } else {
            addLog('success', `✓ Tweet sent${tweetId ? ` (ID: ${tweetId})` : ''}${imageDataUrl ? ' + image' : ''}`);
          }
          return true;
        }

        const errMsg = (data.error as string) ?? `HTTP ${res.status}`;

        // Hard failures — no point retrying
        if (res.status === 401 || res.status === 403) {
          addLog('error', `✗ Tweet failed: ${errMsg}`);
          addLog('error', 'Authentication error — stopping automation. Refresh your X session cookies.');
          stopRequestedRef.current = true;
          return false;
        }

        if (res.status === 429) {
          addLog('error', `✗ Tweet failed: Rate limited by X. Stopping to avoid ban.`);
          stopRequestedRef.current = true;
          return false;
        }

        // Retryable failure
        if (attempt < MAX_RETRIES) {
          addLog('warn', `⚠ Tweet attempt ${attempt}/${MAX_RETRIES} failed — reason: ${errMsg}. Will retry with fresh cookies…`);
          await new Promise(r => setTimeout(r, attempt * 2000));
        } else {
          addLog('error', `✗ Tweet failed after ${MAX_RETRIES} attempts. Last error: ${errMsg}`);
        }
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          addLog('warn', `⚠ Tweet attempt ${attempt}/${MAX_RETRIES} — network error: ${String(err)}. Will retry…`);
          await new Promise(r => setTimeout(r, attempt * 2000));
        } else {
          addLog('error', `✗ Network error after ${MAX_RETRIES} attempts: ${String(err)}`);
        }
      }
    }

    return false;
  }, [addLog]);

  // ── Pick a random image from the pool ─────────────────────────────
  const pickRandomImage = useCallback((): string | undefined => {
    const imgs = imagesRef.current;
    if (!imgs.length) return undefined;
    const img = imgs[Math.floor(Math.random() * imgs.length)];
    return img.url?.startsWith('data:') ? img.url : undefined;
  }, []);

  // ── Pick random usernames (3-6) from the list ─────────────────────
  const pickRandomUsernames = useCallback((): string[] => {
    const all = usernamesRef.current;
    if (!all.length) return [];
    const count = Math.min(randomUsernameCount(), all.length);
    return [...all].sort(() => Math.random() - 0.5).slice(0, count);
  }, []);

  // ── Build a tweet: AI text → image picked → usernames appended ────
  const buildTweet = useCallback(async (
    phase: string,
    index: number,
    total: number
  ): Promise<{ tweetText: string; imageUrl: string | undefined; logLabel: string }> => {
    // Step 1: AI generates the text
    const baseTemplate = contextRef.current.trim();
    let aiText: string | null = null;
    if (baseTemplate) {
      aiText = await generateTweetWithAI(baseTemplate);
    }
    const body = (aiText ?? baseTemplate) || '';

    // Step 2: Pick image
    const imageUrl = pickRandomImage();

    // Step 3: Append usernames
    const picked = pickRandomUsernames();
    const mentionSuffix = picked.map(u => ` @${u.replace(/^@/, '')}`).join('');
    const tweetText = body ? `${body}${mentionSuffix}` : mentionSuffix.trim() || 'XAutomate';

    const logLabel = `[${phase} ${index}/${total}] ${aiText ? '🤖 AI' : '📝 Template'}: "${tweetText.slice(0, 60)}${tweetText.length > 60 ? '...' : ''}"${picked.length ? ` — tagged: ${picked.map(u => `@${u}`).join(', ')}` : ''}`;

    return { tweetText, imageUrl, logLabel };
  }, [generateTweetWithAI, pickRandomImage, pickRandomUsernames]);

  // ── Main automation loop (local browser mode) ─────────────────────
  const runAutomationLoop = useCallback(async () => {
    isRunningRef.current = true;
    stopRequestedRef.current = false;
    pauseRef.current = false;

    const allUsernames = usernamesRef.current;
    const totalUsernames = allUsernames.length;
    let usernamesUsed = 0;

    addLog('info', `🚀 Automation loop started. Target: ${totalUsernames} usernames.`);
    addLog('info', `Pattern: 10 posts → 3 photo-only → rest 3min → 20 posts → rest 10min → repeat`);

    let fullCyclesDone = 0;
    let totalTweetsPosted = tweetsPostedRef.current;

    // Keep going until all usernames are used or stop is requested
    while (!stopRequestedRef.current && usernamesUsed < totalUsernames) {
      // ── Phase A: 10 posts with context + usernames + image ──────────
      addLog('info', `📦 Phase A — 10 posts with context + usernames + image`);
      for (let i = 0; i < PHASE_A_POSTS && !stopRequestedRef.current && usernamesUsed < totalUsernames; i++) {
        // Wait for unpause
        while (pauseRef.current && !stopRequestedRef.current) {
          await new Promise(r => setTimeout(r, 500));
        }
        if (stopRequestedRef.current) break;

        // Order: 1) AI text, 2) image, 3) usernames appended
        const { tweetText, imageUrl, logLabel } = await buildTweet('A', i + 1, PHASE_A_POSTS);
        usernamesUsed = Math.min(usernamesUsed + randomUsernameCount(), totalUsernames);
        addLog('info', logLabel);
        await sendTweet(tweetText, imageUrl);
        totalTweetsPosted++;
        setTweetsPosted(totalTweetsPosted);

        if (i < PHASE_A_POSTS - 1 && !stopRequestedRef.current && usernamesUsed < totalUsernames) {
          const delay = randomDelay();
          const secs = Math.ceil(delay / 1000);
          addLog('info', `⏱ Next post in ${Math.ceil(secs / 60)} min ${secs % 60}s…`);
          const cont = await sleepInterruptible(delay, 'Phase A gap');
          if (!cont) break;
        }
      }

      if (stopRequestedRef.current || usernamesUsed >= totalUsernames) break;

      // ── Phase B: 3 photo-only posts ──────────────────────────────────
      addLog('info', `📸 Phase B — 3 photo-only posts (no text, no usernames)`);
      for (let i = 0; i < PHASE_B_POSTS && !stopRequestedRef.current; i++) {
        while (pauseRef.current && !stopRequestedRef.current) {
          await new Promise(r => setTimeout(r, 500));
        }
        if (stopRequestedRef.current) break;

        const imageUrl = pickRandomImage();
        if (!imageUrl) {
          addLog('warn', `[B ${i + 1}/${PHASE_B_POSTS}] No images available — skipping photo-only post.`);
        } else {
          addLog('info', `[B ${i + 1}/${PHASE_B_POSTS}] Posting photo-only tweet`);
          await sendTweet(' ', imageUrl);
          totalTweetsPosted++;
          setTweetsPosted(totalTweetsPosted);
        }

        if (i < PHASE_B_POSTS - 1 && !stopRequestedRef.current) {
          const delay = randomDelay();
          const secs = Math.ceil(delay / 1000);
          addLog('info', `⏱ Next photo post in ${Math.ceil(secs / 60)} min ${secs % 60}s…`);
          const cont = await sleepInterruptible(delay, 'Phase B gap');
          if (!cont) break;
        }
      }

      if (stopRequestedRef.current || usernamesUsed >= totalUsernames) break;

      // ── Rest 3 minutes ────────────────────────────────────────────────
      addLog('warn', `😴 Resting 3 minutes before next batch…`);
      const cont1 = await sleepInterruptible(REST_AFTER_B_MS, '3min rest');
      if (!cont1 || usernamesUsed >= totalUsernames) break;

      // ── Phase C: 20 posts with context + usernames + image ───────────
      addLog('info', `📦 Phase C — 20 posts with context + usernames + image`);
      for (let i = 0; i < PHASE_C_POSTS && !stopRequestedRef.current && usernamesUsed < totalUsernames; i++) {
        while (pauseRef.current && !stopRequestedRef.current) {
          await new Promise(r => setTimeout(r, 500));
        }
        if (stopRequestedRef.current) break;

        // Order: 1) AI text, 2) image, 3) usernames appended
        const { tweetText, imageUrl, logLabel } = await buildTweet('C', i + 1, PHASE_C_POSTS);
        usernamesUsed = Math.min(usernamesUsed + randomUsernameCount(), totalUsernames);
        addLog('info', logLabel);
        await sendTweet(tweetText, imageUrl);
        totalTweetsPosted++;
        setTweetsPosted(totalTweetsPosted);

        if (i < PHASE_C_POSTS - 1 && !stopRequestedRef.current && usernamesUsed < totalUsernames) {
          const delay = randomDelay();
          const secs = Math.ceil(delay / 1000);
          addLog('info', `⏱ Next post in ${Math.ceil(secs / 60)} min ${secs % 60}s…`);
          const cont = await sleepInterruptible(delay, 'Phase C gap');
          if (!cont) break;
        }
      }

      if (stopRequestedRef.current || usernamesUsed >= totalUsernames) break;

      // ── Rest 10 minutes ───────────────────────────────────────────────
      fullCyclesDone++;
      setCycleCount(fullCyclesDone);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setLastCycleTime(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);

      addLog('success', `✅ Full cycle #${fullCyclesDone} complete (${totalTweetsPosted} tweets total, ~${usernamesUsed}/${totalUsernames} usernames reached)`);
      addLog('warn', `😴 Resting 10 minutes before next full cycle…`);
      const cont2 = await sleepInterruptible(REST_AFTER_C_MS, '10min rest');
      if (!cont2) break;
    }

    // Done
    isRunningRef.current = false;
    if (!stopRequestedRef.current) {
      addLog('success', `🎯 Target reached! All ${totalUsernames} usernames processed. ${totalTweetsPosted} tweets sent across ${fullCyclesDone} full cycle(s).`);
      toast.success('🎯 Target reached!', { description: `All ${totalUsernames} usernames processed. ${totalTweetsPosted} tweets sent.` });
    } else {
      addLog('warn', `🛑 Automation stopped. ${totalTweetsPosted} tweets sent, ~${usernamesUsed}/${totalUsernames} usernames reached.`);
    }
    setStatus('idle');
    setNextCycleIn(null);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, [addLog, sendTweet, pickRandomImage, pickRandomUsernames, sleepInterruptible, buildTweet]);

  // ── Test Tweet ─────────────────────────────────────────────────────
  const handleTestTweet = useCallback(async () => {
    const currentCookies = cookiesRef.current;
    const currentContext = contextRef.current;

    if (!currentCookies.trim()) {
      toast.error('Session cookies required', { description: 'Paste your X session cookies JSON before testing.' });
      return;
    }
    const parsed = parseCookieJson(currentCookies);
    if (!parsed.hasAuthToken || !parsed.hasCt0) {
      toast.error('Missing auth_token or ct0', { description: 'Make sure your cookies include auth_token and ct0.' });
      return;
    }

    setIsTesting(true);
    addLog('info', '🧪 Test tweet — firing one tweet immediately to validate configuration...');
    toast.info('Sending test tweet…', { description: 'Firing one tweet right now to validate your setup.' });

    try {
      // Order: 1) AI generates text, 2) image picked, 3) usernames appended
      let aiText = currentContext.trim() ? await generateTweetWithAI(currentContext.trim()) : null;
      const body = (aiText ?? currentContext.trim()) || 'Test tweet from XAutomate';
      const imageUrl = pickRandomImage();
      const picked = pickRandomUsernames();
      const mentionSuffix = picked.map(u => ` @${u.replace(/^@/, '')}`).join('');
      const tweetText = `${body}${mentionSuffix}`;

      addLog('info', `🧪 Test: ${aiText ? '🤖 AI text' : '📝 Template'} + ${imageUrl ? '🖼 image' : 'no image'} + ${picked.length ? picked.map(u => `@${u}`).join(', ') : 'no mentions'}`);

      const ok = await sendTweet(tweetText, imageUrl);
      if (ok) {
        toast.success('Test tweet sent!', { description: 'Check the activity log for the result.' });
      } else {
        toast.error('Test tweet failed', { description: 'Check the activity log for details.' });
      }
    } catch (err) {
      addLog('error', `Test tweet threw an unexpected error: ${String(err)}`);
      toast.error('Test tweet failed', { description: 'An unexpected error occurred. Check the activity log.' });
    } finally {
      setIsTesting(false);
    }
  }, [addLog, sendTweet, pickRandomImage, pickRandomUsernames, generateTweetWithAI]);

  // ── Start automation ───────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!cookies.trim()) {
      toast.error('Session cookies required', { description: 'Paste your X session cookies JSON before starting.' });
      return;
    }
    if (usernames.length === 0) {
      toast.error('No target usernames', { description: 'Add at least one username to the target list.' });
      return;
    }
    if (!context.trim()) {
      toast.error('Context template empty', { description: 'Add a context/message template before starting.' });
      return;
    }

    const parsed = parseCookieJson(cookies);
    if (parsed.count === 0) {
      toast.error('Invalid cookie format', { description: 'Could not parse any cookies. Paste the JSON array from Cookie-Editor → Export → JSON.' });
      return;
    }
    if (!parsed.hasAuthToken || !parsed.hasCt0) {
      toast.warning('Incomplete cookies', {
        description: `Missing ${[!parsed.hasAuthToken && 'auth_token', !parsed.hasCt0 && 'ct0'].filter(Boolean).join(', ')}. Authentication may fail.`,
      });
    }

    setIsStarting(true);
    addLog('info', 'Saving configuration to server...');

    try {
      // Try server-side mode first
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const res = await fetch('/api/automation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'start',
            proxy,
            cookies,
            context_template: context,
            usernames,
          }),
        });

        if (res.ok) {
          const { config } = await res.json();
          setConfigId(config?.id || null);
          setIsServerMode(true);
          setStatus('running');
          setIsStarting(false);

          addLog('success', `🌐 Server-side automation started! Bot will run 24/7 — you can close this browser.`);
          addLog('info', `Cycle: 10 posts → 3 photo-only → rest 3min → 20 posts → rest 10min → repeat`);
          addLog('info', `Random 1–3 min gaps between posts · 3–6 random usernames per tweet · No character limit`);
          toast.success('🌐 Server automation running!', {
            description: `Bot is now running 24/7 on the server. You can close your browser safely.`,
          });

          // Poll server logs every 30 seconds
          if (logPollRef.current) clearInterval(logPollRef.current);
          logPollRef.current = setInterval(fetchServerLogs, 30000);
          setTimeout(fetchServerLogs, 5000);
          return;
        }
      }

      // Fallback: local browser mode
      addLog('warn', '⚠️ Running in local browser mode — bot stops when browser closes. Sign in for 24/7 server mode.');
      setStatus('running');
      setIsServerMode(false);
      setIsStarting(false);
      setTweetsPosted(0);
      setCycleCount(0);

      toast.success('Automation running', {
        description: `Cycle: 10 posts → 3 photo-only → rest 3min → 20 posts → rest 10min → repeat`,
      });

      // Start the async loop (doesn't block UI)
      runAutomationLoop();
    } catch (err) {
      addLog('error', `Failed to start: ${String(err)}`);
      toast.error('Failed to start automation');
    } finally {
      setIsStarting(false);
    }
  }, [cookies, usernames, context, proxy, addLog, runAutomationLoop, fetchServerLogs]);

  // ── Stop automation ────────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    stopRequestedRef.current = true;
    pauseRef.current = false;
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    if (logPollRef.current) { clearInterval(logPollRef.current); logPollRef.current = null; }

    setStatus('idle');
    setNextCycleIn(null);
    setIsServerMode(false);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await fetch('/api/automation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'stop',
            proxy,
            cookies,
            context_template: context,
            usernames,
          }),
        });
        addLog('warn', `🛑 Server-side automation stopped.`);
      } else {
        addLog('warn', `🛑 Automation stopped after ${tweetsPostedRef.current} tweet(s).`);
      }
    } catch {
      addLog('warn', `🛑 Automation stopped after ${tweetsPostedRef.current} tweet(s).`);
    }

    toast.info('Automation stopped', { description: `${tweetsPostedRef.current} tweet(s) sent this session.` });
  }, [addLog, proxy, cookies, context, usernames]);

  // ── Pause / resume ─────────────────────────────────────────────────
  const handlePause = useCallback(() => {
    if (status === 'running') {
      pauseRef.current = true;
      setStatus('paused');
      addLog('warn', 'Automation paused. Resume to continue.');
      toast.info('Paused — automation will not fire until resumed.');
    } else if (status === 'paused') {
      pauseRef.current = false;
      setStatus('running');
      addLog('success', 'Automation resumed.');
      toast.success('Resumed — automation is running again.');
    }
  }, [status, addLog]);

  // ── Cleanup on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopRequestedRef.current = true;
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (logPollRef.current) clearInterval(logPollRef.current);
    };
  }, []);

  // ── Clear logs ─────────────────────────────────────────────────────
  const handleClearLogs = useCallback(() => {
    setLogs([]);
    addLog('info', 'Activity log cleared.');
  }, [addLog]);

  // ── One-click setup: runs migrations + pg_cron automatically ──────
  const handleSetupEverything = useCallback(async () => {
    setIsSettingUp(true);
    setSetupError(null);
    addLog('info', '⚙️ Running automatic setup — configuring database and 24/7 scheduler...');
    toast.info('Setting up...', { description: 'Configuring database schema and pg_cron scheduler.' });

    try {
      const res = await fetch('/api/setup', { method: 'POST' });
      const data = await res.json() as {
        success: boolean;
        message: string;
        results: { step: string; status: string; detail?: string }[];
        manual_required?: boolean;
      };

      for (const r of (data.results || [])) {
        const level = r.status === 'ok' ? 'success' : r.status === 'skipped' ? 'info' : 'warn';
        addLog(level, `[Setup] ${r.step}: ${r.detail || r.status}`);
      }

      if (data.success) {
        setSetupDone(true);
        addLog('success', '✅ Setup complete! Bot is ready for 24/7 autonomous operation.');
        toast.success('Setup complete!', { description: 'Database and scheduler configured. Hit Start to run the bot.' });
      } else if (data.manual_required) {
        setSetupError('Service role key missing — add SUPABASE_SERVICE_ROLE_KEY to your environment variables.');
        addLog('error', '⚠️ Setup needs SUPABASE_SERVICE_ROLE_KEY in environment variables to configure pg_cron.');
        toast.error('Missing service role key', { description: 'Add SUPABASE_SERVICE_ROLE_KEY to your .env file.' });
      } else {
        setSetupError(data.message || 'Setup partially completed. Check the activity log.');
        addLog('warn', `⚠️ Setup result: ${data.message}`);
        toast.warning('Setup partially done', { description: data.message });
      }
    } catch (err) {
      const msg = String(err);
      setSetupError(msg);
      addLog('error', `Setup failed: ${msg}`);
      toast.error('Setup failed', { description: msg });
    } finally {
      setIsSettingUp(false);
    }
  }, [addLog]);

  return (
    <>
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
          },
        }}
      />

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-6">

        {/* ── One-click Setup Banner ─────────────────────────────────── */}
        {!setupDone && (
          <div className={`mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-lg border px-4 py-3 ${setupError ? 'border-red-500/30 bg-red-500/10' : 'border-blue-500/30 bg-blue-500/10'}`}>
            <div className="flex-1 min-w-0">
              {setupError ? (
                <p className="text-sm text-red-400 font-medium">⚠️ {setupError}</p>
              ) : (
                <p className="text-sm text-blue-300 font-medium">
                  🚀 <strong>First time?</strong> Click &quot;Setup Everything&quot; — we&apos;ll configure the database and 24/7 scheduler automatically. No manual steps needed.
                </p>
              )}
            </div>
            <button
              onClick={handleSetupEverything}
              disabled={isSettingUp}
              className="flex-shrink-0 flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              {isSettingUp ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Setting up…
                </>
              ) : (
                <>⚙️ Setup Everything</>
              )}
            </button>
            {!setupError && (
              <button
                onClick={() => setSetupDone(true)}
                className="flex-shrink-0 text-xs text-blue-400/60 hover:text-blue-400 transition-colors underline"
              >
                Already done
              </button>
            )}
          </div>
        )}

        {/* Setup success confirmation */}
        {setupDone && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
            <span className="text-emerald-400 text-sm">✅ Setup complete — database and 24/7 scheduler are configured.</span>
            <button onClick={() => setSetupDone(false)} className="ml-auto text-xs text-emerald-400/50 hover:text-emerald-400">dismiss</button>
          </div>
        )}

        {/* Server mode banner */}
        {isServerMode && status === 'running' && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <p className="text-sm text-emerald-400 font-medium">
              🌐 Running 24/7 on server — safe to close your browser. Bot will keep tweeting until you hit Stop or target is reached.
            </p>
          </div>
        )}

        {/* Status Bar */}
        <StatusBar
          status={status}
          cycleCount={cycleCount}
          lastCycleTime={lastCycleTime}
          targetCount={mounted ? usernames.length : 0}
          imageCount={mounted ? images.length : 0}
          nextCycleIn={nextCycleIn}
          intervalMinutes={1}
        />

        {/* Main Config Grid */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-5 gap-4">

          {/* Left column — proxy + cookies + context */}
          <div className="lg:col-span-1 xl:col-span-2 flex flex-col gap-4">
            <ProxyConfigCard
              value={proxy}
              onChange={setProxy}
              isRunning={status === 'running'}
            />
            <SessionCookiesCard
              value={cookies}
              onChange={setCookies}
              isRunning={status === 'running'}
            />
            <ContextTemplateCard
              value={context}
              onChange={setContext}
              isRunning={status === 'running'}
            />
            <OpenRouterKeyCard
              value={openRouterKey}
              onChange={setOpenRouterKey}
              isRunning={status === 'running'}
            />
          </div>

          {/* Right column — usernames + images + cycle control */}
          <div className="lg:col-span-1 xl:col-span-3 flex flex-col gap-4">
            <UsernameListManager
              usernames={usernames}
              onChange={setUsernames}
              isRunning={status === 'running'}
              onLog={addLog}
            />
            <ImageAttachmentManager
              images={images}
              onChange={setImages}
              isRunning={status === 'running'}
            />
            <CycleControlCard
              totalUsernames={usernames.length}
              status={status}
              isStarting={isStarting}
              isTesting={isTesting}
              cycleCount={cycleCount}
              tweetsPosted={tweetsPosted}
              onStart={handleStart}
              onStop={handleStop}
              onPause={handlePause}
              onTestTweet={handleTestTweet}
            />
          </div>
        </div>

        {/* Activity Log */}
        <div className="mt-4">
          <ActivityLog logs={logs} onClear={handleClearLogs} />
        </div>

        {/* Footer note */}
        <div className="mt-6 pb-6 flex items-center justify-center gap-2">
          <span className="text-xs text-muted-foreground font-mono-data">
            XAutomate · Personal experiment tool · Use responsibly
          </span>
        </div>
      </div>
    </>
  );
}