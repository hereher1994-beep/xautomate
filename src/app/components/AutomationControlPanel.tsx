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
import type { AutomationStatus, LogEntry, AccountConfig, ImageAttachment } from '../types/automation';
import { parseCookieJson } from '../types/automation';

const INITIAL_LOG: LogEntry[] = [
  {
    id: 'log-init-001',
    timestamp: '2026-09-06 14:23:20',
    level: 'info',
    message: 'XAutomate initialized. Configure settings and press Start to begin.',
  },
];

interface AutomationControlPanelProps {
  account?: AccountConfig;
  onAccountChange?: (updated: AccountConfig) => void;
}

export default function AutomationControlPanel({ account, onAccountChange }: AutomationControlPanelProps) {
  // ── Core config state — seeded from account prop if provided ───────
  const [proxy, setProxyState] = useState(account?.proxy ?? '');
  const [cookies, setCookiesState] = useState(account?.cookies ?? '');
  const [context, setContextState] = useState(account?.context ?? '');
  const [usernames, setUsernamesState] = useState<string[]>(
    account?.usernames ?? ['elonmusk', 'sama', 'karpathy', 'naval', 'paulg']
  );
  const [images, setImagesState] = useState<ImageAttachment[]>(account?.images ?? []);
  const [intervalMinutes, setIntervalMinutesState] = useState<number>(account?.intervalMinutes ?? 15);
  const [usernamesPerTweet, setUsernamesPerTweetState] = useState<number>(account?.usernamesPerTweet ?? 4);

  // ── localStorage key (per-account or global) ──────────────────────
  const lsKey = account ? `xautomate_state_${account.id}` : 'xautomate_state_default';

  // ── Load from localStorage on mount (if no account prop) ──────────
  useEffect(() => {
    if (account) return; // account prop takes priority
    try {
      const raw = localStorage.getItem(lsKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.proxy !== undefined) setProxyState(saved.proxy);
      if (saved.cookies !== undefined) setCookiesState(saved.cookies);
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
    proxy: string; cookies: string; context: string;
    usernames: string[]; images: ImageAttachment[];
    intervalMinutes: number; usernamesPerTweet: number;
  }>) => {
    try {
      const current = (() => {
        try { return JSON.parse(localStorage.getItem(lsKey) ?? '{}'); } catch { return {}; }
      })();
      const merged = { ...current, ...patch };
      localStorage.setItem(lsKey, JSON.stringify(merged));

      // Also update ct0 inside cookies JSON if it changed
      if (patch.cookies !== undefined && account) {
        const updatedAccount: AccountConfig = {
          ...account,
          proxy: patch.proxy ?? current.proxy ?? account.proxy,
          cookies: patch.cookies,
          context: patch.context ?? current.context ?? account.context,
          usernames: patch.usernames ?? current.usernames ?? account.usernames,
          images: patch.images ?? current.images ?? account.images,
          intervalMinutes: patch.intervalMinutes ?? current.intervalMinutes ?? account.intervalMinutes,
          usernamesPerTweet: patch.usernamesPerTweet ?? current.usernamesPerTweet ?? account.usernamesPerTweet,
        };
        onAccountChange?.(updatedAccount);
      } else if (account) {
        const updatedAccount: AccountConfig = {
          ...account,
          ...patch,
        };
        onAccountChange?.(updatedAccount);
      }
    } catch { /* ignore */ }
  }, [lsKey, account, onAccountChange]);

  // ── Setters that auto-save ─────────────────────────────────────────
  const setProxy = useCallback((v: string) => { setProxyState(v); persistState({ proxy: v }); }, [persistState]);
  const setCookies = useCallback((v: string) => { setCookiesState(v); persistState({ cookies: v }); }, [persistState]);
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

  // ── Live refs so fireCycle always reads current state ──────────────
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const usernamesRef = useRef(usernames);
  usernamesRef.current = usernames;
  const usernamesPerTweetRef = useRef(usernamesPerTweet);
  usernamesPerTweetRef.current = usernamesPerTweet;
  const contextRef = useRef(context);
  contextRef.current = context;
  const cookiesRef = useRef(cookies);
  cookiesRef.current = cookies;

  // ── Log helper ─────────────────────────────────────────────────────
  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const id = `log-${Date.now()}-${Math.floor(cycleCountRef.current * 100)}`;
    setLogs(prev => [{ id, timestamp, level, message }, ...prev].slice(0, 200));
  }, []);

  // ── ct0 rotation: update cookies JSON with new ct0 value ──────────
  const rotateCt0 = useCallback((newCt0: string) => {
    const currentCookies = cookiesRef.current;
    try {
      const parsed = JSON.parse(currentCookies);
      if (!Array.isArray(parsed)) return;
      const updated = parsed.map((c: { name: string; value: string }) =>
        c.name === 'ct0' ? { ...c, value: newCt0 } : c
      );
      const newJson = JSON.stringify(updated, null, 2);
      setCookies(newJson);
      addLog('info', `ct0 CSRF token rotated and saved to localStorage.`);
    } catch { /* ignore */ }
  }, [setCookies, addLog]);

  // ── Fire a real tweet cycle ────────────────────────────────────────
  const fireCycle = useCallback(async () => {
    const newCount = cycleCountRef.current + 1;
    setCycleCount(newCount);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    setLastCycleTime(ts);

    // ── Step 1: Read all current values via refs ──────────────────────
    const currentCookies = cookiesRef.current;
    const currentImages = imagesRef.current;
    const currentUsernames = usernamesRef.current;
    const currentUsernamesPerTweet = usernamesPerTweetRef.current;
    const currentContext = contextRef.current;

    // ── Step 2: Parse cookies ─────────────────────────────────────────
    const parsed = parseCookieJson(currentCookies);
    const ct0 = parsed.pairs['ct0'] ?? '';

    if (!parsed.hasAuthToken || !ct0) {
      addLog('error', `Cycle #${newCount} aborted — missing auth_token or ct0 in cookies.`);
      return;
    }

    // ── Step 3: Pick random image — already stored as base64 data URL ─
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

    // ── Step 4: Pick N random usernames and build mention suffix ──────
    const pickCount = Math.min(currentUsernamesPerTweet, currentUsernames.length);
    const shuffled = [...currentUsernames].sort(() => Math.random() - 0.5);
    const pickedUsernames = pickCount > 0 ? shuffled.slice(0, pickCount) : [];
    const mentionSuffix = pickedUsernames.map(u => ` @${u.replace(/^@/, '')}`).join('');

    // ── Step 5: Build final tweet text ────────────────────────────────
    const baseText = currentContext.trim();
    const tweetText = baseText
      ? `${baseText}${mentionSuffix}`
      : mentionSuffix.trim();

    addLog('info', `Cycle #${newCount} — tweet ready: "${tweetText.slice(0, 80)}${tweetText.length > 80 ? '...' : ''}" (${tweetText.length} chars)${imageDataUrl ? ' + image' : ''}`);

    if (!tweetText.trim()) {
      addLog('warn', `Cycle #${newCount} skipped — tweet text is empty after building.`);
      return;
    }

    // ── Step 6: Fire the tweet ────────────────────────────────────────
    try {
      const res = await fetch('/api/tweet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cookieString: parsed.headerString,
          ct0,
          tweetText,
          ...(imageDataUrl ? { imageDataUrl } : {}),
        }),
      });

      const data = await res.json() as Record<string, unknown>;

      if (res.ok && data.success) {
        const tweetData = data.data as { data?: { create_tweet?: { tweet_results?: { result?: { rest_id?: string } } } } } | undefined;
        const tweetId = tweetData?.data?.create_tweet?.tweet_results?.result?.rest_id;
        const mediaNote = data.mediaId ? ` + image "${chosenImageName}"` : '';
        const usersNote = pickedUsernames.length > 0 ? ` — tagged: ${pickedUsernames.map(u => `@${u}`).join(', ')}` : '';
        addLog('success', `✓ Tweet sent${mediaNote}${tweetId ? ` (ID: ${tweetId})` : ''}${usersNote}`);

        // ── ct0 rotation: save new token if X rotated it ──────────────
        if (data.newCt0 && typeof data.newCt0 === 'string' && data.newCt0 !== ct0) {
          rotateCt0(data.newCt0);
        }
      } else {
        const errMsg = (data.error as string) ?? `HTTP ${res.status}`;
        addLog('error', `✗ Tweet failed: ${errMsg}`);

        if (res.status === 401 || res.status === 403) {
          addLog('error', 'Authentication error — stopping automation. Refresh your X session cookies.');
          setStatus('error');
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (countdownRef.current) clearInterval(countdownRef.current);
          return;
        }
      }
    } catch (err) {
      addLog('error', `✗ Network error on cycle #${newCount}: ${String(err)}`);
    }

    addLog('success', `Cycle #${newCount} complete.`);
  }, [addLog, rotateCt0]);

  // ── Test Tweet — fire one tweet immediately to validate config ─────
  const handleTestTweet = useCallback(async () => {
    const currentCookies = cookiesRef.current;
    const currentContext = contextRef.current;

    if (!currentCookies.trim()) {
      toast.error('Session cookies required', { description: 'Paste your X session cookies JSON before testing.' });
      return;
    }
    if (!currentContext.trim()) {
      toast.error('Context template empty', { description: 'Add a context/message template before testing.' });
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
      await fireCycle();
      toast.success('Test tweet sent!', { description: 'Check the activity log for the result.' });
    } catch (err) {
      addLog('error', `Test tweet threw an unexpected error: ${String(err)}`);
      toast.error('Test tweet failed', { description: 'An unexpected error occurred. Check the activity log.' });
    } finally {
      setIsTesting(false);
    }
  }, [addLog, fireCycle]);

  // ── Phase A/B/C schedule runner ────────────────────────────────────
  const runSchedule = useCallback(async () => {
    const sleep = (ms: number) => new Promise<void>(resolve => {
      const t = setTimeout(resolve, ms);
      // store so stop can clear it
      (runSchedule as unknown as { _sleepTimer?: ReturnType<typeof setTimeout> })._sleepTimer = t;
    });

    const randomGap = () => {
      // 1–3 minutes in ms
      return (60 + Math.floor(Math.random() * 120)) * 1000;
    };

    const stopRef = intervalRef; // reuse intervalRef as a "running" flag (null = stopped)

    addLog('info', '▶ Schedule started — Phase A: 10 posts (1–3 min gaps)');

    // ── Phase A: 10 posts ─────────────────────────────────────────────
    for (let i = 0; i < 10; i++) {
      if (!stopRef.current && i > 0) return; // stopped
      await fireCycle();
      if (i < 9) {
        const gap = randomGap();
        addLog('info', `Phase A — post ${i + 1}/10 done. Next in ${Math.round(gap / 1000)}s…`);
        setNextCycleIn(Math.round(gap / 1000));
        await sleep(gap);
        if (!stopRef.current) return;
      }
    }
    if (!stopRef.current) return;
    addLog('success', 'Phase A complete (10 posts). Starting Phase B: 3 photo-only posts…');

    // ── Phase B: 3 photo-only posts ───────────────────────────────────
    for (let i = 0; i < 3; i++) {
      if (!stopRef.current) return;
      await fireCycle();
      if (i < 2) {
        const gap = randomGap();
        addLog('info', `Phase B — photo post ${i + 1}/3 done. Next in ${Math.round(gap / 1000)}s…`);
        setNextCycleIn(Math.round(gap / 1000));
        await sleep(gap);
        if (!stopRef.current) return;
      }
    }
    if (!stopRef.current) return;
    addLog('success', 'Phase B complete (3 photo posts). Resting 3 minutes…');

    // ── 3-minute rest between B and C ─────────────────────────────────
    const restBC = 3 * 60 * 1000;
    setNextCycleIn(3 * 60);
    await sleep(restBC);
    if (!stopRef.current) return;

    addLog('info', 'Rest done. Starting Phase C: 20 posts (1–3 min gaps)…');

    // ── Phase C: 20 posts ─────────────────────────────────────────────
    for (let i = 0; i < 20; i++) {
      if (!stopRef.current) return;
      await fireCycle();
      if (i < 19) {
        const gap = randomGap();
        addLog('info', `Phase C — post ${i + 1}/20 done. Next in ${Math.round(gap / 1000)}s…`);
        setNextCycleIn(Math.round(gap / 1000));
        await sleep(gap);
        if (!stopRef.current) return;
      }
    }
    if (!stopRef.current) return;
    addLog('success', 'Phase C complete (20 posts). Resting 10 minutes before next cycle…');

    // ── 10-minute rest, then repeat ───────────────────────────────────
    const restEnd = 10 * 60 * 1000;
    setNextCycleIn(10 * 60);
    await sleep(restEnd);
    if (!stopRef.current) return;

    addLog('info', '10-min rest done. Repeating schedule from Phase A…');
    // Recurse to repeat
    runSchedule();
  }, [addLog, fireCycle, intervalRef]);

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
    addLog('info', 'Validating configuration...');

    await new Promise(r => setTimeout(r, 1200));

    if (proxy.trim()) {
      addLog('info', `Proxy configured: ${proxy.replace(/:.+@/, ':***@')}`);
    } else {
      addLog('warn', 'No proxy set — using direct connection. Consider adding a proxy for safety.');
    }

    const authFields = [
      parsed.hasAuthToken && 'auth_token',
      parsed.hasCt0 && 'ct0',
      parsed.hasTwid && 'twid',
    ].filter(Boolean);
    addLog('info', `Cookies parsed: ${parsed.count} pairs found. Auth fields: [${authFields.join(', ') || 'none'}].`);
    addLog('info', `Cookie header ready — ${parsed.headerString.length} chars, ${parsed.count} key(s).`);
    addLog('info', `Context template: "${context.slice(0, 60)}${context.length > 60 ? '...' : ''}"`);
    addLog('success', `Automation started — Phase A(10) → Phase B(3 photo) → 3min rest → Phase C(20) → 10min rest → repeat.`);

    setStatus('running');
    setIsStarting(false);
    // Use intervalRef as a "running" sentinel (non-null = running)
    intervalRef.current = setInterval(() => {}, 1 << 30); // dummy interval, never fires

    toast.success('Automation running', {
      description: 'Phase A: 10 posts → Phase B: 3 photo posts → Phase C: 20 posts → repeat.',
    });

    runSchedule();
  }, [cookies, usernames, context, proxy, addLog, runSchedule, intervalRef]);

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
      intervalRef.current = null;
      setStatus('paused');
      addLog('warn', 'Automation paused. Resume to continue cycling.');
      toast.info('Paused — automation will not fire until resumed.');
    } else if (status === 'paused') {
      setNextCycleIn(null);
      intervalRef.current = setInterval(() => {}, 1 << 30); // sentinel
      setStatus('running');
      addLog('success', 'Automation resumed — continuing schedule.');
      toast.success('Resumed — automation is running again.');
      runSchedule();
    }
  }, [status, addLog, runSchedule, intervalRef]);

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