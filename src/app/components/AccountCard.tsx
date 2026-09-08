'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { User, Trash2, Play, Square, Pause, FlaskConical, RotateCcw, ChevronDown, ChevronUp, Activity, Zap, Clock } from 'lucide-react';
import ProxyConfigCard from './ProxyConfigCard';
import SessionCookiesCard from './SessionCookiesCard';
import ContextTemplateCard from './ContextTemplateCard';
import UsernameListManager from './UsernameListManager';
import ImageAttachmentManager from './ImageAttachmentManager';
import ActivityLog from './ActivityLog';
import OpenRouterKeyCard from './OpenRouterKeyCard';
import { parseCookieJson } from '../types/automation';
import type { XAccount } from '../types/account';
import type { LogEntry } from '../types/automation';

// ── Cycle constants (same as main panel) ──────────────────────────
const PHASE_A_POSTS = 10;
const PHASE_B_POSTS = 3;
const PHASE_C_POSTS = 20;
const REST_AFTER_B_MS = 3 * 60 * 1000;
const REST_AFTER_C_MS = 10 * 60 * 1000;
const MIN_DELAY_MS = 1 * 60 * 1000;
const MAX_DELAY_MS = 3 * 60 * 1000;
const MIN_USERNAMES = 3;
const MAX_USERNAMES = 6;

function randomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
}
function randomUsernameCount() {
  return Math.floor(Math.random() * (MAX_USERNAMES - MIN_USERNAMES + 1)) + MIN_USERNAMES;
}

interface AccountCardProps {
  account: XAccount;
  index: number;
  onUpdate: (id: string, patch: Partial<XAccount>) => void;
  onRemove: (id: string) => void;
}

export default function AccountCard({ account, index, onUpdate, onRemove }: AccountCardProps) {
  const [expanded, setExpanded] = useState(index === 0);
  const [logs, setLogs] = useState<LogEntry[]>([{
    id: 'init',
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    level: 'info',
    message: `Account "${account.name}" ready. Configure and press Start.`,
  }]);
  const [nextCycleIn, setNextCycleIn] = useState<number | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  const stopRef = useRef(false);
  const pauseRef = useRef(false);
  const isRunningRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live refs
  const cookiesRef = useRef(account.cookies);
  cookiesRef.current = account.cookies;
  const proxyRef = useRef(account.proxy);
  proxyRef.current = account.proxy;
  const contextRef = useRef(account.context);
  contextRef.current = account.context;
  const usernamesRef = useRef(account.usernames);
  usernamesRef.current = account.usernames;
  const imagesRef = useRef(account.images);
  imagesRef.current = account.images;
  const openRouterKeyRef = useRef(account.openRouterKey);
  openRouterKeyRef.current = account.openRouterKey;

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const id = `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setLogs(prev => [{ id, timestamp, level, message }, ...prev].slice(0, 300));
  }, []);

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

  const sleepInterruptible = useCallback(async (ms: number): Promise<boolean> => {
    const steps = Math.ceil(ms / 1000);
    startCountdown(steps);
    for (let i = 0; i < steps; i++) {
      if (stopRef.current) return false;
      while (pauseRef.current && !stopRef.current) {
        await new Promise(r => setTimeout(r, 500));
      }
      if (stopRef.current) return false;
      await new Promise(r => setTimeout(r, 1000));
    }
    return true;
  }, [startCountdown]);

  const generateTweetWithAI = useCallback(async (contextTemplate: string): Promise<string | null> => {
    const apiKey = openRouterKeyRef.current.trim();
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
              content: `You are a tweet writer. The user has provided a context/rules template below. Write ONE unique tweet that follows those rules exactly. Output ONLY the tweet text — no quotes, no explanation, no hashtags unless the rules say so, no @mentions.\n\nRULES / CONTEXT:\n${contextTemplate}`,
            },
            { role: 'user', content: 'Write a unique tweet following the rules above. Output only the tweet text.' },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { content?: string };
      const text = data.content?.trim() ?? '';
      return text.replace(/@\w+/g, '').replace(/\s{2,}/g, ' ').trim() || null;
    } catch {
      return null;
    }
  }, []);

  const pickRandomImage = useCallback((): string | undefined => {
    const imgs = imagesRef.current;
    if (!imgs.length) return undefined;
    const img = imgs[Math.floor(Math.random() * imgs.length)];
    return img.url?.startsWith('data:') ? img.url : undefined;
  }, []);

  const pickRandomUsernames = useCallback((): string[] => {
    const all = usernamesRef.current;
    if (!all.length) return [];
    const count = Math.min(randomUsernameCount(), all.length);
    return [...all].sort(() => Math.random() - 0.5).slice(0, count);
  }, []);

  const sendTweet = useCallback(async (tweetText: string, imageDataUrl?: string): Promise<boolean> => {
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const rawCookies = cookiesRef.current;
      const freshProxy = proxyRef.current;
      const parsed = parseCookieJson(rawCookies);
      const ct0 = parsed.pairs['ct0'] ?? '';

      if (!parsed.hasAuthToken || !ct0) {
        addLog('error', `[${account.name}] Tweet aborted — missing auth_token or ct0.`);
        return false;
      }

      try {
        if (attempt > 1) addLog('warn', `[${account.name}] Retry ${attempt - 1}/${MAX_RETRIES - 1}…`);

        const res = await fetch('/api/tweet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cookieString: parsed.headerString,
            ct0,
            tweetText,
            ...(imageDataUrl ? { imageDataUrl } : {}),
            ...(freshProxy ? { proxy: freshProxy } : {}),
            forceRefresh: attempt > 1,
          }),
        });

        const data = await res.json() as Record<string, unknown>;

        if (res.ok && data.success) {
          const newCt0 = data.newCt0 as string | null | undefined;
          if (newCt0) {
            try {
              const cookieArray = JSON.parse(rawCookies) as Array<{ name: string; value: string }>;
              if (Array.isArray(cookieArray)) {
                const idx = cookieArray.findIndex(c => c.name === 'ct0');
                if (idx !== -1) cookieArray[idx] = { ...cookieArray[idx], value: newCt0 };
                else cookieArray.push({ name: 'ct0', value: newCt0 });
                onUpdate(account.id, { cookies: JSON.stringify(cookieArray) });
              }
            } catch { /* non-critical */ }
          }

          const tweetData = data.data as { data?: { create_tweet?: { tweet_results?: { result?: { rest_id?: string } } } } } | undefined;
          const tweetId = tweetData?.data?.create_tweet?.tweet_results?.result?.rest_id;
          addLog('success', `[${account.name}] ✓ Tweet sent${tweetId ? ` (ID: ${tweetId})` : ''}${imageDataUrl ? ' + image' : ''}`);
          return true;
        }

        const errMsg = (data.error as string) ?? `HTTP ${res.status}`;
        if (res.status === 401 || res.status === 403) {
          addLog('error', `[${account.name}] Auth error — stopping. Refresh cookies.`);
          stopRef.current = true;
          return false;
        }
        if (res.status === 429) {
          addLog('error', `[${account.name}] Rate limited — stopping.`);
          stopRef.current = true;
          return false;
        }
        if (attempt < MAX_RETRIES) {
          addLog('warn', `[${account.name}] Attempt ${attempt} failed: ${errMsg}. Retrying…`);
          await new Promise(r => setTimeout(r, attempt * 2000));
        } else {
          addLog('error', `[${account.name}] Failed after ${MAX_RETRIES} attempts: ${errMsg}`);
        }
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          addLog('warn', `[${account.name}] Network error attempt ${attempt}: ${String(err)}`);
          await new Promise(r => setTimeout(r, attempt * 2000));
        } else {
          addLog('error', `[${account.name}] Network error: ${String(err)}`);
        }
      }
    }
    return false;
  }, [account.id, account.name, addLog, onUpdate]);

  const buildTweet = useCallback(async (phase: string, index: number, total: number) => {
    const baseTemplate = contextRef.current.trim();
    let aiText: string | null = null;
    if (baseTemplate) aiText = await generateTweetWithAI(baseTemplate);
    const body = (aiText ?? baseTemplate) || '';
    const imageUrl = pickRandomImage();
    const picked = pickRandomUsernames();
    const mentionSuffix = picked.map(u => ` @${u.replace(/^@/, '')}`).join('');
    const tweetText = body ? `${body}${mentionSuffix}` : mentionSuffix.trim() || 'XAutomate';
    const logLabel = `[${account.name}][${phase} ${index}/${total}] ${aiText ? '🤖 AI' : '📝 Template'}: "${tweetText.slice(0, 60)}${tweetText.length > 60 ? '...' : ''}"`;
    return { tweetText, imageUrl, logLabel };
  }, [account.name, generateTweetWithAI, pickRandomImage, pickRandomUsernames]);

  const runLoop = useCallback(async () => {
    isRunningRef.current = true;
    stopRef.current = false;
    pauseRef.current = false;

    const allUsernames = usernamesRef.current;
    const totalUsernames = allUsernames.length;
    let usernamesUsed = 0;
    let fullCyclesDone = 0;
    let totalTweetsPosted = 0;

    addLog('info', `[${account.name}] 🚀 Started. Target: ${totalUsernames} usernames.`);

    while (!stopRef.current && usernamesUsed < totalUsernames) {
      // Phase A
      addLog('info', `[${account.name}] 📦 Phase A — 10 posts`);
      for (let i = 0; i < PHASE_A_POSTS && !stopRef.current && usernamesUsed < totalUsernames; i++) {
        while (pauseRef.current && !stopRef.current) await new Promise(r => setTimeout(r, 500));
        if (stopRef.current) break;
        const { tweetText, imageUrl, logLabel } = await buildTweet('A', i + 1, PHASE_A_POSTS);
        usernamesUsed = Math.min(usernamesUsed + randomUsernameCount(), totalUsernames);
        addLog('info', logLabel);
        await sendTweet(tweetText, imageUrl);
        totalTweetsPosted++;
        onUpdate(account.id, { tweetsPosted: totalTweetsPosted });
        if (i < PHASE_A_POSTS - 1 && !stopRef.current && usernamesUsed < totalUsernames) {
          const delay = randomDelay();
          addLog('info', `[${account.name}] ⏱ Next in ${Math.ceil(delay / 60000)}m…`);
          if (!await sleepInterruptible(delay)) break;
        }
      }
      if (stopRef.current || usernamesUsed >= totalUsernames) break;

      // Phase B
      addLog('info', `[${account.name}] 📸 Phase B — 3 photo-only`);
      for (let i = 0; i < PHASE_B_POSTS && !stopRef.current; i++) {
        while (pauseRef.current && !stopRef.current) await new Promise(r => setTimeout(r, 500));
        if (stopRef.current) break;
        const imageUrl = pickRandomImage();
        if (!imageUrl) { addLog('warn', `[${account.name}] No images — skipping photo post.`); }
        else {
          addLog('info', `[${account.name}] [B ${i + 1}/${PHASE_B_POSTS}] Photo-only post`);
          await sendTweet(' ', imageUrl);
          totalTweetsPosted++;
          onUpdate(account.id, { tweetsPosted: totalTweetsPosted });
        }
        if (i < PHASE_B_POSTS - 1 && !stopRef.current) {
          if (!await sleepInterruptible(randomDelay())) break;
        }
      }
      if (stopRef.current || usernamesUsed >= totalUsernames) break;

      addLog('warn', `[${account.name}] 😴 Resting 3 min…`);
      if (!await sleepInterruptible(REST_AFTER_B_MS) || usernamesUsed >= totalUsernames) break;

      // Phase C
      addLog('info', `[${account.name}] 📦 Phase C — 20 posts`);
      for (let i = 0; i < PHASE_C_POSTS && !stopRef.current && usernamesUsed < totalUsernames; i++) {
        while (pauseRef.current && !stopRef.current) await new Promise(r => setTimeout(r, 500));
        if (stopRef.current) break;
        const { tweetText, imageUrl, logLabel } = await buildTweet('C', i + 1, PHASE_C_POSTS);
        usernamesUsed = Math.min(usernamesUsed + randomUsernameCount(), totalUsernames);
        addLog('info', logLabel);
        await sendTweet(tweetText, imageUrl);
        totalTweetsPosted++;
        onUpdate(account.id, { tweetsPosted: totalTweetsPosted });
        if (i < PHASE_C_POSTS - 1 && !stopRef.current && usernamesUsed < totalUsernames) {
          const delay = randomDelay();
          addLog('info', `[${account.name}] ⏱ Next in ${Math.ceil(delay / 60000)}m…`);
          if (!await sleepInterruptible(delay)) break;
        }
      }
      if (stopRef.current || usernamesUsed >= totalUsernames) break;

      fullCyclesDone++;
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const lastCycleTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      onUpdate(account.id, { cycleCount: fullCyclesDone, lastCycleTime });
      addLog('success', `[${account.name}] ✅ Cycle #${fullCyclesDone} complete (${totalTweetsPosted} tweets)`);
      addLog('warn', `[${account.name}] 😴 Resting 10 min…`);
      if (!await sleepInterruptible(REST_AFTER_C_MS)) break;
    }

    isRunningRef.current = false;
    if (!stopRef.current) {
      addLog('success', `[${account.name}] 🎯 Done! ${totalTweetsPosted} tweets, ${fullCyclesDone} cycles.`);
      onUpdate(account.id, { status: 'done' });
      toast.success(`${account.name} — Done!`, { description: `${totalTweetsPosted} tweets sent.` });
    } else {
      addLog('warn', `[${account.name}] 🛑 Stopped. ${totalTweetsPosted} tweets sent.`);
      onUpdate(account.id, { status: 'idle' });
    }
    setNextCycleIn(null);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, [account.id, account.name, addLog, buildTweet, sendTweet, pickRandomImage, sleepInterruptible, onUpdate]);

  const handleStart = useCallback(async () => {
    if (!account.cookies.trim()) {
      toast.error(`${account.name}: Cookies required`);
      return;
    }
    if (!account.usernames.length) {
      toast.error(`${account.name}: Add at least one username`);
      return;
    }
    if (!account.context.trim()) {
      toast.error(`${account.name}: Context template required`);
      return;
    }
    const parsed = parseCookieJson(account.cookies);
    if (!parsed.hasAuthToken || !parsed.hasCt0) {
      toast.warning(`${account.name}: Incomplete cookies — missing auth_token or ct0`);
    }
    setIsStarting(true);
    onUpdate(account.id, { status: 'running' });
    setIsStarting(false);
    addLog('success', `[${account.name}] ▶ Automation started`);
    toast.success(`${account.name} started`);
    runLoop();
  }, [account, addLog, onUpdate, runLoop]);

  const handleStop = useCallback(() => {
    stopRef.current = true;
    pauseRef.current = false;
    setConfirmStop(false);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setNextCycleIn(null);
    onUpdate(account.id, { status: 'idle' });
    addLog('warn', `[${account.name}] 🛑 Stop requested.`);
  }, [account.id, account.name, addLog, onUpdate]);

  const handlePause = useCallback(() => {
    if (account.status === 'running') {
      pauseRef.current = true;
      onUpdate(account.id, { status: 'paused' });
      addLog('warn', `[${account.name}] ⏸ Paused.`);
    } else if (account.status === 'paused') {
      pauseRef.current = false;
      onUpdate(account.id, { status: 'running' });
      addLog('success', `[${account.name}] ▶ Resumed.`);
    }
  }, [account.id, account.name, account.status, addLog, onUpdate]);

  const handleTestTweet = useCallback(async () => {
    if (!account.cookies.trim()) { toast.error(`${account.name}: Cookies required`); return; }
    const parsed = parseCookieJson(account.cookies);
    if (!parsed.hasAuthToken || !parsed.hasCt0) { toast.error(`${account.name}: Missing auth_token or ct0`); return; }
    setIsTesting(true);
    addLog('info', `[${account.name}] 🧪 Test tweet firing…`);
    try {
      let aiText = account.context.trim() ? await generateTweetWithAI(account.context.trim()) : null;
      const body = (aiText ?? account.context.trim()) || 'Test tweet from XAutomate';
      const imageUrl = pickRandomImage();
      const picked = pickRandomUsernames();
      const mentionSuffix = picked.map(u => ` @${u.replace(/^@/, '')}`).join('');
      const tweetText = `${body}${mentionSuffix}`;
      const ok = await sendTweet(tweetText, imageUrl);
      if (ok) toast.success(`${account.name}: Test tweet sent!`);
      else toast.error(`${account.name}: Test tweet failed`);
    } catch (err) {
      addLog('error', `[${account.name}] Test error: ${String(err)}`);
    } finally {
      setIsTesting(false);
    }
  }, [account, addLog, generateTweetWithAI, pickRandomImage, pickRandomUsernames, sendTweet]);

  useEffect(() => {
    return () => {
      stopRef.current = true;
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const isActive = account.status === 'running' || account.status === 'paused';
  const statusColor = {
    idle: 'text-muted-foreground',
    running: 'text-primary',
    paused: 'text-accent',
    error: 'text-red-400',
    done: 'text-emerald-400',
  }[account.status];

  const statusDot = {
    idle: 'bg-muted-foreground',
    running: 'bg-primary animate-pulse',
    paused: 'bg-accent',
    error: 'bg-red-500',
    done: 'bg-emerald-500',
  }[account.status];

  return (
    <div className="rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      {/* ── Account Header ─────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(p => !p)}
      >
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
        <User size={15} className="text-primary flex-shrink-0" />
        <input
          className="flex-1 bg-transparent text-sm font-semibold text-foreground outline-none min-w-0"
          value={account.name}
          onChange={e => { e.stopPropagation(); onUpdate(account.id, { name: e.target.value }); }}
          onClick={e => e.stopPropagation()}
          placeholder="Account name"
        />

        {/* Mini stats */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
          <span className={`font-medium ${statusColor}`}>{account.status.toUpperCase()}</span>
          <span className="flex items-center gap-1"><Zap size={11} />{account.cycleCount} cycles</span>
          <span className="flex items-center gap-1"><Activity size={11} />{account.tweetsPosted} tweets</span>
          {nextCycleIn !== null && (
            <span className="flex items-center gap-1 text-primary">
              <Clock size={11} />
              {String(Math.floor(nextCycleIn / 60)).padStart(2, '0')}:{String(nextCycleIn % 60).padStart(2, '0')}
            </span>
          )}
        </div>

        {/* Action buttons (always visible) */}
        <div className="flex items-center gap-1.5 ml-2" onClick={e => e.stopPropagation()}>
          {!isActive ? (
            <>
              <button
                type="button"
                className="btn-primary text-xs px-2.5 py-1.5 gap-1"
                onClick={handleStart}
                disabled={isStarting || isTesting}
                title="Start automation"
              >
                {isStarting ? <RotateCcw size={12} className="animate-spin" /> : <Play size={12} />}
                <span className="hidden sm:inline">Start</span>
              </button>
              <button
                type="button"
                className="btn-secondary text-xs px-2 py-1.5"
                onClick={handleTestTweet}
                disabled={isStarting || isTesting}
                title="Test tweet"
              >
                {isTesting ? <RotateCcw size={12} className="animate-spin" /> : <FlaskConical size={12} />}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary text-xs px-2.5 py-1.5 gap-1"
                onClick={handlePause}
              >
                {account.status === 'paused' ? <Play size={12} /> : <Pause size={12} />}
                <span className="hidden sm:inline">{account.status === 'paused' ? 'Resume' : 'Pause'}</span>
              </button>
              <button
                type="button"
                className="text-xs px-2.5 py-1.5 gap-1 flex items-center rounded font-medium transition-all"
                style={{
                  backgroundColor: confirmStop ? 'rgba(239,68,68,0.15)' : 'var(--input)',
                  color: confirmStop ? '#ef4444' : 'var(--muted-foreground)',
                  border: `1px solid ${confirmStop ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
                }}
                onClick={() => {
                  if (!confirmStop) { setConfirmStop(true); setTimeout(() => setConfirmStop(false), 4000); }
                  else handleStop();
                }}
              >
                <Square size={12} />
                <span className="hidden sm:inline">{confirmStop ? 'Confirm' : 'Stop'}</span>
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-icon text-red-400 hover:text-red-300 ml-1"
            onClick={() => onRemove(account.id)}
            title="Remove account"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {expanded ? <ChevronUp size={15} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={15} className="text-muted-foreground flex-shrink-0" />}
      </div>

      {/* ── Expanded Config ────────────────────────────────────────── */}
      {expanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-5 gap-4">
            {/* Left column */}
            <div className="lg:col-span-1 xl:col-span-2 flex flex-col gap-4">
              <ProxyConfigCard
                value={account.proxy}
                onChange={v => onUpdate(account.id, { proxy: v })}
                isRunning={isActive}
              />
              <SessionCookiesCard
                value={account.cookies}
                onChange={v => onUpdate(account.id, { cookies: v })}
                isRunning={isActive}
              />
              <ContextTemplateCard
                value={account.context}
                onChange={v => onUpdate(account.id, { context: v })}
                isRunning={isActive}
              />
              <OpenRouterKeyCard
                value={account.openRouterKey}
                onChange={v => onUpdate(account.id, { openRouterKey: v })}
                isRunning={isActive}
              />
            </div>

            {/* Right column */}
            <div className="lg:col-span-1 xl:col-span-3 flex flex-col gap-4">
              <UsernameListManager
                usernames={account.usernames}
                onChange={v => onUpdate(account.id, { usernames: v })}
                isRunning={isActive}
                onLog={addLog}
              />
              <ImageAttachmentManager
                images={account.images}
                onChange={v => onUpdate(account.id, { images: v })}
                isRunning={isActive}
              />

              {/* Cycle stats mini card */}
              <div className="config-card">
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={14} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Stats</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded p-2.5" style={{ backgroundColor: 'var(--input)', border: '1px solid var(--border)' }}>
                    <span className="config-label mb-0.5">Status</span>
                    <span className={`font-mono-data text-sm font-bold ${statusColor}`}>{account.status}</span>
                  </div>
                  <div className="rounded p-2.5" style={{ backgroundColor: 'var(--input)', border: '1px solid var(--border)' }}>
                    <span className="config-label mb-0.5">Cycles</span>
                    <span className="font-mono-data text-lg font-bold text-foreground">{account.cycleCount}</span>
                  </div>
                  <div className="rounded p-2.5" style={{ backgroundColor: 'var(--input)', border: '1px solid var(--border)' }}>
                    <span className="config-label mb-0.5">Tweets</span>
                    <span className="font-mono-data text-lg font-bold text-foreground">{account.tweetsPosted}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Activity log per account */}
          <div className="mt-4">
            <ActivityLog logs={logs} onClear={() => setLogs([])} />
          </div>
        </div>
      )}
    </div>
  );
}
