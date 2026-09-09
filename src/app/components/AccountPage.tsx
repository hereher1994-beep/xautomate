'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Trash2, Play, Square, Pause, FlaskConical, RotateCcw, Activity, Zap, Clock, ArrowLeft, Settings } from 'lucide-react';
import ProxyConfigCard from './ProxyConfigCard';
import SessionCookiesCard from './SessionCookiesCard';
import ContextTemplateCard from './ContextTemplateCard';
import UsernameListManager from './UsernameListManager';
import ImageAttachmentManager from './ImageAttachmentManager';
import ActivityLog from './ActivityLog';
import OpenRouterKeyCard from './OpenRouterKeyCard';
import TwitterLoginCard from './TwitterLoginCard';
import { parseCookieJson } from '../types/automation';
import type { XAccount } from '../types/account';
import type { LogEntry } from '../types/automation';
import { getSessionForAccount, type AccountSession } from '@/lib/accountSessions';

// ── Cycle constants ────────────────────────────────────────────────
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

interface AccountPageProps {
  account: XAccount;
  onUpdate: (id: string, patch: Partial<XAccount>) => void;
  onRemove: (id: string) => void;
  onBack: () => void;
}

export default function AccountPage({ account, onUpdate, onRemove, onBack }: AccountPageProps) {
  const [activeTab, setActiveTab] = useState<'config' | 'log'>('config');
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
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(account.name);
  // Per-account Twitter session
  const [accountSession, setAccountSession] = useState<AccountSession | null>(() => getSessionForAccount(account.id));

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
  // Live ref for account session (OAuth token)
  const accountSessionRef = useRef(accountSession);
  accountSessionRef.current = accountSession;

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const id = `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setLogs(prev => [{ id, timestamp, level, message }, ...prev].slice(0, 500));
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
      const session = accountSessionRef.current;
      const freshProxy = proxyRef.current;

      // Use browser session cookies (new flow) or fall back to manually pasted cookies
      const sessionCookieJson = session?.cookieJson;
      const sessionCt0 = session?.ct0;
      const rawCookies = cookiesRef.current;

      if (!sessionCookieJson && !rawCookies.trim()) {
        addLog('error', `[${account.name}] Tweet aborted — not logged in with X and no cookies set.`);
        return false;
      }

      // Cookie-based auth validation (only if not using browser session)
      if (!sessionCookieJson) {
        const parsed = parseCookieJson(rawCookies);
        const ct0 = parsed.pairs['ct0'] ?? '';
        if (!parsed.hasAuthToken || !ct0) {
          addLog('error', `[${account.name}] Tweet aborted — missing auth_token or ct0.`);
          return false;
        }
      }

      try {
        if (attempt > 1) addLog('warn', `[${account.name}] Retry ${attempt - 1}/${MAX_RETRIES - 1}…`);

        let body: Record<string, unknown>;

        if (sessionCookieJson && sessionCt0) {
          // Browser session path — use cookies from login
          const parsed = parseCookieJson(sessionCookieJson);
          body = {
            cookieString: parsed.headerString,
            ct0: sessionCt0,
            tweetText,
            ...(imageDataUrl ? { imageDataUrl } : {}),
            ...(freshProxy ? { proxy: freshProxy } : {}),
            forceRefresh: attempt > 1,
          };
        } else {
          // Manually pasted cookies fallback
          const parsed = parseCookieJson(rawCookies);
          const ct0 = parsed.pairs['ct0'] ?? '';
          body = {
            cookieString: parsed.headerString,
            ct0,
            tweetText,
            ...(imageDataUrl ? { imageDataUrl } : {}),
            ...(freshProxy ? { proxy: freshProxy } : {}),
            forceRefresh: attempt > 1,
          };
        }

        const res = await fetch('/api/tweet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json() as Record<string, unknown>;

        if (res.ok && data.success) {
          // Update ct0 if returned
          const newCt0 = data.newCt0 as string | null | undefined;
          if (newCt0 && !sessionCookieJson) {
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
          addLog('error', `[${account.name}] Auth error — stopping. Re-login to your X account.`);
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
    let body = (aiText ?? baseTemplate) || '';
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

    let cycleCount = account.cycleCount;
    let tweetsPosted = account.tweetsPosted;
    let phase: 'A' | 'B' | 'rest_B' | 'C' | 'rest_C' = account.cyclePhase ?? 'A';
    let phasePostCount = account.phasePostCount ?? 0;

    addLog('info', `▶ Starting automation for "${account.name}" — Phase ${phase}, post ${phasePostCount}`);
    onUpdate(account.id, { status: 'running', cyclePhase: phase, phasePostCount });

    while (!stopRef.current) {
      while (pauseRef.current && !stopRef.current) {
        await new Promise(r => setTimeout(r, 500));
      }
      if (stopRef.current) break;

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      if (phase === 'A') {
        const { tweetText, imageUrl, logLabel } = await buildTweet('A', phasePostCount + 1, PHASE_A_POSTS);
        addLog('info', logLabel);
        const ok = await sendTweet(tweetText, imageUrl);
        if (ok) { tweetsPosted++; onUpdate(account.id, { tweetsPosted, lastCycleTime: ts }); }
        phasePostCount++;
        onUpdate(account.id, { cyclePhase: 'A', phasePostCount });
        if (phasePostCount >= PHASE_A_POSTS) {
          phase = 'B'; phasePostCount = 0;
          addLog('info', `Phase A complete → Phase B (3 photo posts)`);
          onUpdate(account.id, { cyclePhase: 'B', phasePostCount: 0 });
        }
        if (!stopRef.current) {
          const d = randomDelay();
          addLog('info', `⏱ Next post in ${Math.ceil(d/60000)}m`);
          const ok2 = await sleepInterruptible(d);
          if (!ok2) break;
        }

      } else if (phase === 'B') {
        const imageUrl = pickRandomImage();
        addLog('info', `[${account.name}][B ${phasePostCount+1}/${PHASE_B_POSTS}] 📸 Photo-only post`);
        const ok = await sendTweet('📸', imageUrl);
        if (ok) { tweetsPosted++; onUpdate(account.id, { tweetsPosted, lastCycleTime: ts }); }
        phasePostCount++;
        onUpdate(account.id, { cyclePhase: 'B', phasePostCount });
        if (phasePostCount >= PHASE_B_POSTS) {
          phase = 'rest_B'; phasePostCount = 0;
          addLog('warn', `Phase B complete → Resting 3 minutes`);
          onUpdate(account.id, { cyclePhase: 'rest_B', phasePostCount: 0 });
          const ok2 = await sleepInterruptible(REST_AFTER_B_MS);
          if (!ok2) break;
          phase = 'C'; phasePostCount = 0;
          addLog('info', `Rest done → Phase C (20 posts)`);
          onUpdate(account.id, { cyclePhase: 'C', phasePostCount: 0 });
        } else {
          const d = randomDelay();
          const ok2 = await sleepInterruptible(d);
          if (!ok2) break;
        }

      } else if (phase === 'C') {
        const { tweetText, imageUrl, logLabel } = await buildTweet('C', phasePostCount + 1, PHASE_C_POSTS);
        addLog('info', logLabel);
        const ok = await sendTweet(tweetText, imageUrl);
        if (ok) { tweetsPosted++; onUpdate(account.id, { tweetsPosted, lastCycleTime: ts }); }
        phasePostCount++;
        onUpdate(account.id, { cyclePhase: 'C', phasePostCount });
        if (phasePostCount >= PHASE_C_POSTS) {
          cycleCount++;
          onUpdate(account.id, { cycleCount });
          addLog('success', `✅ Full cycle #${cycleCount} complete! ${tweetsPosted} tweets total → Resting 10 minutes`);
          phase = 'rest_C'; phasePostCount = 0;
          onUpdate(account.id, { cyclePhase: 'rest_C', phasePostCount: 0 });
          const ok2 = await sleepInterruptible(REST_AFTER_C_MS);
          if (!ok2) break;
          phase = 'A'; phasePostCount = 0;
          addLog('info', `10-min rest done → Restarting Phase A`);
          onUpdate(account.id, { cyclePhase: 'A', phasePostCount: 0 });
        } else {
          const d = randomDelay();
          addLog('info', `⏱ Next post in ${Math.ceil(d/60000)}m`);
          const ok2 = await sleepInterruptible(d);
          if (!ok2) break;
        }
      }
    }

    isRunningRef.current = false;
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setNextCycleIn(null);
    onUpdate(account.id, { status: stopRef.current ? 'idle' : 'done', cyclePhase: phase, phasePostCount });
    addLog(stopRef.current ? 'warn' : 'success', stopRef.current ? `⏹ Stopped.` : `🎯 All tasks complete!`);
  }, [account, addLog, buildTweet, onUpdate, pickRandomImage, sendTweet, sleepInterruptible]);

  const handleStart = useCallback(async () => {
    if (isRunningRef.current) return;
    const session = accountSessionRef.current;
    const hasCookies = account.cookies.trim().length > 0;
    if (!session?.accessToken && !hasCookies) {
      toast.error('Sign in with X first (or add session cookies)');
      return;
    }
    setIsStarting(true);
    await new Promise(r => setTimeout(r, 100));
    setIsStarting(false);
    runLoop();
  }, [account.cookies, runLoop]);

  const handlePause = useCallback(() => {
    if (!isRunningRef.current) return;
    pauseRef.current = !pauseRef.current;
    onUpdate(account.id, { status: pauseRef.current ? 'paused' : 'running' });
    addLog('warn', pauseRef.current ? '⏸ Paused.' : '▶ Resumed.');
    toast.info(pauseRef.current ? 'Paused' : 'Resumed');
  }, [account.id, addLog, onUpdate]);

  const handleStop = useCallback(() => {
    if (!confirmStop) { setConfirmStop(true); setTimeout(() => setConfirmStop(false), 3000); return; }
    stopRef.current = true;
    pauseRef.current = false;
    setConfirmStop(false);
    toast.info('Stopping…');
  }, [confirmStop]);

  const handleReset = useCallback(() => {
    if (isRunningRef.current) { toast.error('Stop first'); return; }
    onUpdate(account.id, { cycleCount: 0, tweetsPosted: 0, status: 'idle', cyclePhase: 'A', phasePostCount: 0, lastCycleTime: null });
    setLogs([{ id: 'reset', timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19), level: 'info', message: 'Stats reset.' }]);
    toast.success('Stats reset');
  }, [account.id, onUpdate]);

  const handleTest = useCallback(async () => {
    if (isTesting) return;
    const session = accountSessionRef.current;
    const hasCookies = account.cookies.trim().length > 0;
    if (!session?.accessToken && !hasCookies) {
      toast.error('Sign in with X first (or add session cookies)');
      return;
    }
    setIsTesting(true);
    addLog('info', `[${account.name}] 🧪 Test tweet…`);
    const ok = await sendTweet('🧪 XAutomate test tweet — ignore this!');
    setIsTesting(false);
    if (ok) toast.success('Test tweet sent!');
    else toast.error('Test tweet failed — check your X login');
  }, [account.cookies, account.name, addLog, isTesting, sendTweet]);

  const handleSaveName = useCallback(() => {
    if (nameInput.trim()) {
      onUpdate(account.id, { name: nameInput.trim() });
      toast.success('Name updated');
    }
    setEditingName(false);
  }, [account.id, nameInput, onUpdate]);

  const isRunning = account.status === 'running';
  const isPaused  = account.status === 'paused';
  const isActive  = isRunning || isPaused;

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          All Accounts
        </button>
        <span className="text-muted-foreground">/</span>
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
              className="text-base font-bold bg-transparent border-b border-primary outline-none text-foreground"
              autoFocus
            />
            <button type="button" onClick={handleSaveName} className="text-xs text-primary">Save</button>
            <button type="button" onClick={() => setEditingName(false)} className="text-xs text-muted-foreground">Cancel</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setEditingName(true); setNameInput(account.name); }}
            className="text-base font-bold text-foreground hover:text-primary transition-colors"
            title="Click to rename"
          >
            {account.name}
          </button>
        )}

        {/* Status badge */}
        <div className="ml-2 flex items-center gap-1.5">
          {isRunning && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
          {isPaused  && <span className="w-2 h-2 rounded-full bg-yellow-400" />}
          {account.status === 'error' && <span className="w-2 h-2 rounded-full bg-red-400" />}
          {account.status === 'done'  && <span className="w-2 h-2 rounded-full bg-green-400" />}
          <span className="text-xs text-muted-foreground capitalize">{account.status}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onRemove(account.id)}
            disabled={isActive}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-30"
          >
            <Trash2 size={13} />
            Remove
          </button>
        </div>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Tweets Sent', value: account.tweetsPosted, icon: <Activity size={14} /> },
          { label: 'Full Cycles', value: account.cycleCount, icon: <RotateCcw size={14} /> },
          { label: 'Current Phase', value: account.cyclePhase, icon: <Zap size={14} /> },
          { label: 'Phase Post', value: `${account.phasePostCount}`, icon: <Clock size={14} /> },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl p-4 border" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              {stat.icon}
              {stat.label}
            </div>
            <p className="text-xl font-bold text-foreground font-mono-data">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ── Control buttons ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-6 p-4 rounded-xl border" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
        {/* Start */}
        {!isActive && (
          <button
            type="button"
            onClick={handleStart}
            disabled={isStarting}
            className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm font-semibold"
          >
            <Play size={15} />
            {isStarting ? 'Starting…' : 'Start'}
          </button>
        )}

        {/* Pause / Resume */}
        {isActive && (
          <button
            type="button"
            onClick={handlePause}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all"
            style={{ backgroundColor: isPaused ? 'var(--primary)' : 'rgba(234,179,8,0.15)', color: isPaused ? '#000' : '#eab308', border: `1px solid ${isPaused ? 'transparent' : 'rgba(234,179,8,0.3)'}` }}
          >
            {isPaused ? <Play size={15} /> : <Pause size={15} />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        )}

        {/* Stop */}
        {isActive && (
          <button
            type="button"
            onClick={handleStop}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all"
            style={{ backgroundColor: confirmStop ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <Square size={15} />
            {confirmStop ? 'Confirm Stop?' : 'Stop'}
          </button>
        )}

        {/* Test */}
        <button
          type="button"
          onClick={handleTest}
          disabled={isTesting || isActive}
          className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg transition-all disabled:opacity-40"
          style={{ backgroundColor: 'var(--input)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
        >
          <FlaskConical size={14} />
          {isTesting ? 'Testing…' : 'Test Tweet'}
        </button>

        {/* Reset */}
        <button
          type="button"
          onClick={handleReset}
          disabled={isActive}
          className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg transition-all disabled:opacity-40"
          style={{ backgroundColor: 'var(--input)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
        >
          <RotateCcw size={14} />
          Reset Stats
        </button>

        {/* Countdown */}
        {nextCycleIn !== null && (
          <div className="ml-auto flex items-center gap-2 text-sm font-mono-data text-muted-foreground">
            <Clock size={14} className="text-primary" />
            Next in {Math.floor(nextCycleIn / 60)}:{String(nextCycleIn % 60).padStart(2, '0')}
          </div>
        )}
      </div>

      {/* ── Tab switcher ────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit mb-5"
        style={{ backgroundColor: 'var(--input)', border: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={() => setActiveTab('config')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'config' ? 'bg-primary text-black shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Settings size={13} />
          Configuration
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('log')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'log' ? 'bg-primary text-black shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Activity size={13} />
          Activity Log
          {logs.filter(l => l.level === 'error').length > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
          )}
        </button>
      </div>

      {/* ── Config tab ──────────────────────────────────────────── */}
      {activeTab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Twitter Login — always first, uses per-account session */}
          <TwitterLoginCard
            accountId={account.id}
            proxy={account.proxy}
            isRunning={isActive}
            onSessionChange={setAccountSession}
          />
          <ProxyConfigCard
            value={account.proxy}
            onChange={v => onUpdate(account.id, { proxy: v })}
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
          {/* Legacy cookies — kept as fallback */}
          <SessionCookiesCard
            value={account.cookies}
            onChange={v => onUpdate(account.id, { cookies: v })}
            isRunning={isActive}
          />
        </div>
      )}

      {/* ── Log tab ─────────────────────────────────────────────── */}
      {activeTab === 'log' && (
        <ActivityLog logs={logs} onClear={() => setLogs([])} />
      )}
    </div>
  );
}
