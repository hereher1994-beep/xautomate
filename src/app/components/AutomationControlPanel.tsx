'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { useSession } from 'next-auth/react';
import StatusBar from './StatusBar';
import ProxyConfigCard from './ProxyConfigCard';
import TwitterLoginCard from './TwitterLoginCard';
import ContextTemplateCard from './ContextTemplateCard';
import UsernameListManager from './UsernameListManager';
import ImageAttachmentManager from './ImageAttachmentManager';
import CycleControlCard from './CycleControlCard';
import ActivityLog from './ActivityLog';
import type { AutomationStatus, LogEntry, AccountConfig, ImageAttachment } from '../types/automation';

const INITIAL_LOG: LogEntry[] = [
  {
    id: 'log-init-001',
    timestamp: '2026-09-06 14:23:20',
    level: 'info',
    message: 'XAutomate initialized. Sign in with X and press Start to begin.',
  },
];

interface AutomationControlPanelProps {
  account?: AccountConfig;
  onAccountChange?: (updated: AccountConfig) => void;
}

export default function AutomationControlPanel({ account, onAccountChange }: AutomationControlPanelProps) {
  const { data: session } = useSession();
  const accessToken = (session as any)?.accessToken as string | undefined;

  // ── Core config state — seeded from account prop if provided ───────
  const [proxy, setProxyState] = useState(account?.proxy ?? '');
  const [context, setContextState] = useState(account?.context ?? '');
  const [usernames, setUsernamesState] = useState<string[]>(
    account?.usernames ?? ['elonmusk', 'sama', 'karpathy', 'naval', 'paulg']
  );
  const [images, setImagesState] = useState<ImageAttachment[]>(account?.images ?? []);
  const [intervalMinutes, setIntervalMinutesState] = useState<number>(account?.intervalMinutes ?? 15);
  const [usernamesPerTweet, setUsernamesPerTweetState] = useState<number>(account?.usernamesPerTweet ?? 4);

  // ── localStorage key (per-account or global) ──────────────────────
  const lsKey = account ? `xautomate_state_${account.id}` : 'xautomate_state_default';

  // ── Load from localStorage on mount ───────────────────────────────
  useEffect(() => {
    if (account) return;
    try {
      const raw = localStorage.getItem(lsKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.proxy !== undefined) setProxyState(saved.proxy);
      if (saved.context !== undefined) setContextState(saved.context);
      if (Array.isArray(saved.usernames)) setUsernamesState(saved.usernames);
      if (Array.isArray(saved.images)) setImagesState(saved.images);
      if (typeof saved.intervalMinutes === 'number') setIntervalMinutesState(saved.intervalMinutes);
      if (typeof saved.usernamesPerTweet === 'number') setUsernamesPerTweetState(saved.usernamesPerTweet);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist to localStorage + notify parent on every change ───────
  const persistState = useCallback((patch: Partial<{
    proxy: string; context: string;
    usernames: string[]; images: ImageAttachment[];
    intervalMinutes: number; usernamesPerTweet: number;
  }>) => {
    try {
      const current = (() => {
        try { return JSON.parse(localStorage.getItem(lsKey) ?? '{}'); } catch { return {}; }
      })();
      const merged = { ...current, ...patch };
      localStorage.setItem(lsKey, JSON.stringify(merged));

      if (account) {
        const updatedAccount: AccountConfig = { ...account, ...patch };
        onAccountChange?.(updatedAccount);
      }
    } catch { /* ignore */ }
  }, [lsKey, account, onAccountChange]);

  // ── Setters that auto-save ─────────────────────────────────────────
  const setProxy = useCallback((v: string) => { setProxyState(v); persistState({ proxy: v }); }, [persistState]);
  const setContext = useCallback((v: string) => { setContextState(v); persistState({ context: v }); }, [persistState]);
  const setUsernames = useCallback((v: string[]) => { setUsernamesState(v); persistState({ usernames: v }); }, [persistState]);
  const setImages = useCallback((v: ImageAttachment[]) => { setImagesState(v); persistState({ images: v }); }, [persistState]);
  const setIntervalMinutes = useCallback((v: number) => { setIntervalMinutesState(v); persistState({ intervalMinutes: v }); }, [persistState]);
  const setUsernamesPerTweet = useCallback((v: number) => { setUsernamesPerTweetState(v); persistState({ usernamesPerTweet: v }); }, [persistState]);

  // ── Run state ──────────────────────────────────────────────────────
  const [status, setStatus] = useState<AutomationStatus>('idle');
  const [cycleCount, setCycleCount] = useState(0);
  const [lastCycleTime, setLastCycleTime] = useState<string | null>(null);
  const [nextCycleIn, setNextCycleIn] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOG);
  const [isStarting, setIsStarting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cycleCountRef = useRef(cycleCount);
  cycleCountRef.current = cycleCount;
  const consecutiveAuthFailuresRef = useRef(0);

  // ── Live refs so fireCycle always reads current state ──────────────
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const usernamesRef = useRef(usernames);
  usernamesRef.current = usernames;
  const usernamesPerTweetRef = useRef(usernamesPerTweet);
  usernamesPerTweetRef.current = usernamesPerTweet;
  const contextRef = useRef(context);
  contextRef.current = context;
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  // ── Log helper ─────────────────────────────────────────────────────
  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const id = `log-${Date.now()}-${Math.floor(cycleCountRef.current * 100)}`;
    setLogs(prev => [{ id, timestamp, level, message }, ...prev].slice(0, 200));
  }, []);

  // ── Fire a real tweet cycle ────────────────────────────────────────
  const fireCycle = useCallback(async () => {
    const newCount = cycleCountRef.current + 1;
    setCycleCount(newCount);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    setLastCycleTime(ts);

    const currentAccessToken = accessTokenRef.current;
    const currentImages = imagesRef.current;
    const currentUsernames = usernamesRef.current;
    const currentUsernamesPerTweet = usernamesPerTweetRef.current;
    const currentContext = contextRef.current;

    if (!currentAccessToken) {
      addLog('error', `Cycle #${newCount} aborted — not signed in with X. Please sign in first.`);
      return;
    }

    // ── Pick random image ─────────────────────────────────────────────
    let imageDataUrl: string | undefined;
    let chosenImageName: string | undefined;
    if (currentImages.length > 0) {
      const randomIdx = Math.floor(Math.random() * currentImages.length);
      const chosenImage = currentImages[randomIdx];
      chosenImageName = chosenImage.name;
      if (chosenImage.url && chosenImage.url.startsWith('data:')) {
        imageDataUrl = chosenImage.url;
        addLog('info', `Cycle #${newCount} — image selected: "${chosenImageName}" (${randomIdx + 1}/${currentImages.length})`);
      } else {
        addLog('warn', `Cycle #${newCount} — image "${chosenImageName}" has unexpected URL format, tweeting without image.`);
      }
    }

    // ── Pick N random usernames ───────────────────────────────────────
    const pickCount = Math.min(currentUsernamesPerTweet, currentUsernames.length);
    const shuffled = [...currentUsernames].sort(() => Math.random() - 0.5);
    const pickedUsernames = pickCount > 0 ? shuffled.slice(0, pickCount) : [];
    const mentionSuffix = pickedUsernames.map(u => ` @${u.replace(/^@/, '')}`).join('');

    // ── Build tweet text ──────────────────────────────────────────────
    const baseText = currentContext.trim();
    const tweetText = baseText ? `${baseText}${mentionSuffix}` : mentionSuffix.trim();

    addLog('info', `Cycle #${newCount} — tweet ready: "${tweetText.slice(0, 80)}${tweetText.length > 80 ? '...' : ''}" (${tweetText.length} chars)${imageDataUrl ? ' + image' : ''}`);

    if (!tweetText.trim()) {
      addLog('warn', `Cycle #${newCount} skipped — tweet text is empty after building.`);
      return;
    }

    // ── Fire the tweet ────────────────────────────────────────────────
    try {
      const res = await fetch('/api/tweet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: currentAccessToken,
          tweetText,
          ...(imageDataUrl ? { imageDataUrl } : {}),
        }),
      });

      const data = await res.json() as Record<string, unknown>;

      if (res.ok && data.success) {
        const tweetId = (data.tweetId as string) ?? null;
        const mediaNote = data.mediaId ? ` + image "${chosenImageName}"` : '';
        const usersNote = pickedUsernames.length > 0 ? ` — tagged: ${pickedUsernames.map(u => `@${u}`).join(', ')}` : '';
        addLog('success', `✓ Tweet sent${mediaNote}${tweetId ? ` (ID: ${tweetId})` : ''}${usersNote}`);
        consecutiveAuthFailuresRef.current = 0;
      } else {
        const errMsg = (data.error as string) ?? `HTTP ${res.status}`;
        addLog('error', `✗ Tweet failed: ${errMsg}`);

        if (res.status === 401 || res.status === 403) {
          consecutiveAuthFailuresRef.current += 1;
          const failCount = consecutiveAuthFailuresRef.current;

          if (failCount >= 3) {
            addLog('error', `OAuth token expired after ${failCount} consecutive failures — stopping automation. Please sign out and sign in again.`);
            setStatus('error');
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
            consecutiveAuthFailuresRef.current = 0;
          } else {
            addLog('warn', `Auth failure #${failCount}/3 — automation continues.`);
          }
          return;
        }
      }
    } catch (err) {
      addLog('error', `✗ Network error on cycle #${newCount}: ${String(err)}`);
    }

    addLog('success', `Cycle #${newCount} complete.`);
  }, [addLog]);

  // ── Test Tweet ─────────────────────────────────────────────────────
  const handleTestTweet = useCallback(async () => {
    const currentAccessToken = accessTokenRef.current;
    const currentContext = contextRef.current;

    if (!currentAccessToken) {
      toast.error('Not signed in', { description: 'Please sign in with X before testing.' });
      return;
    }
    if (!currentContext.trim()) {
      toast.error('Context template empty', { description: 'Add a context/message template before testing.' });
      return;
    }

    setIsTesting(true);
    addLog('info', '🧪 Test tweet — firing one tweet immediately to validate configuration...');
    toast.info('Sending test tweet…', { description: 'Firing one tweet right now to validate your setup.' });

    try {
      await fireCycle();
      toast.success('Test tweet sent!', { description: 'Check the activity log for the result.' });
    } catch (err) {
      addLog('error', `Test tweet threw an unexpected error: ${String(err)}`);
      toast.error('Test tweet failed', { description: 'An unexpected error occurred. Check the activity log.' });
    } finally {
      setIsTesting(false);
    }
  }, [addLog, fireCycle]);

  // ── Start automation ───────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!accessToken) {
      toast.error('Not signed in', { description: 'Please sign in with X before starting automation.' });
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

    setIsStarting(true);
    addLog('info', 'Validating configuration...');
    await new Promise(r => setTimeout(r, 1200));

    if (proxy.trim()) {
      addLog('info', `Proxy configured: ${proxy.replace(/:.+@/, ':***@')}`);
    } else {
      addLog('warn', 'No proxy set — using direct connection.');
    }

    addLog('info', `OAuth 2.0 token active — authenticated as ${session?.user?.name ?? 'unknown'}`);
    addLog('info', `Context template: "${context.slice(0, 60)}${context.length > 60 ? '...' : ''}"`);
    addLog('success', `Automation started — ${usernames.length} targets (${usernamesPerTweet} tagged per tweet), ${intervalMinutes}m interval.`);

    setStatus('running');
    setIsStarting(false);
    setNextCycleIn(intervalMinutes * 60);

    toast.success('Automation running', {
      description: `Cycling every ${intervalMinutes} minute${intervalMinutes !== 1 ? 's' : ''} — tagging ${usernamesPerTweet} username${usernamesPerTweet !== 1 ? 's' : ''} per tweet.`,
    });

    fireCycle();

    intervalRef.current = setInterval(() => {
      fireCycle();
      setNextCycleIn(intervalMinutes * 60);
    }, intervalMinutes * 60 * 1000);

    countdownRef.current = setInterval(() => {
      setNextCycleIn(prev => {
        if (prev === null || prev <= 1) return intervalMinutes * 60;
        return prev - 1;
      });
    }, 1000);
  }, [accessToken, usernames, context, proxy, intervalMinutes, usernamesPerTweet, addLog, fireCycle, session]);

  // ── Stop automation ────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    intervalRef.current = null;
    countdownRef.current = null;
    setStatus('idle');
    setNextCycleIn(null);
    addLog('warn', `Automation stopped after ${cycleCountRef.current} cycle(s).`);
    toast.info('Automation stopped', { description: `${cycleCountRef.current} cycle(s) completed this session.` });
  }, [addLog]);

  // ── Pause / resume ─────────────────────────────────────────────────
  const handlePause = useCallback(() => {
    if (status === 'running') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setStatus('paused');
      addLog('warn', 'Automation paused. Resume to continue cycling.');
      toast.info('Paused — automation will not fire until resumed.');
    } else if (status === 'paused') {
      setNextCycleIn(intervalMinutes * 60);
      intervalRef.current = setInterval(() => {
        fireCycle();
        setNextCycleIn(intervalMinutes * 60);
      }, intervalMinutes * 60 * 1000);
      countdownRef.current = setInterval(() => {
        setNextCycleIn(prev => {
          if (prev === null || prev <= 1) return intervalMinutes * 60;
          return prev - 1;
        });
      }, 1000);
      setStatus('running');
      addLog('success', 'Automation resumed.');
      toast.success('Resumed — automation is running again.');
    }
  }, [status, intervalMinutes, addLog, fireCycle]);

  // ── Cleanup on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // ── Clear logs ─────────────────────────────────────────────────────
  const handleClearLogs = useCallback(() => {
    setLogs([]);
    addLog('info', 'Activity log cleared.');
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

        {/* Account label if in multi-account mode */}
        {account && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono-data">Account:</span>
            <span className="text-sm font-semibold text-foreground">{account.name}</span>
            <span className="font-mono-data text-xs text-muted-foreground">({account.id})</span>
          </div>
        )}

        {/* Status Bar */}
        <StatusBar
          status={status}
          cycleCount={cycleCount}
          lastCycleTime={lastCycleTime}
          targetCount={usernames.length}
          imageCount={images.length}
          nextCycleIn={nextCycleIn}
          intervalMinutes={intervalMinutes}
        />

        {/* Main Config Grid */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-5 gap-4">

          {/* Left column — twitter login + proxy + context */}
          <div className="lg:col-span-1 xl:col-span-2 flex flex-col gap-4">
            <TwitterLoginCard
              session={session}
              isRunning={status === 'running'}
            />
            <ProxyConfigCard
              value={proxy}
              onChange={setProxy}
              isRunning={status === 'running'}
            />
            <ContextTemplateCard
              value={context}
              onChange={setContext}
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
              intervalMinutes={intervalMinutes}
              onIntervalChange={setIntervalMinutes}
              usernamesPerTweet={usernamesPerTweet}
              onUsernamesPerTweetChange={setUsernamesPerTweet}
              totalUsernames={usernames.length}
              status={status}
              isStarting={isStarting}
              isTesting={isTesting}
              cycleCount={cycleCount}
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