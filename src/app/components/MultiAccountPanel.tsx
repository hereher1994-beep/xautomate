'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { PlusCircle, Users, LayoutGrid, ExternalLink, Trash2, Activity, Clock, CheckCircle2, Pause } from 'lucide-react';
import Link from 'next/link';
import { createDefaultAccount } from '../types/account';
import type { XAccount } from '../types/account';

const LS_ACCOUNTS = 'xautomate_accounts_v1';

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
  } catch { /* quota */ }
}

function StatusBadge({ status }: { status: XAccount['status'] }) {
  const map: Record<XAccount['status'], { label: string; color: string; dot: string }> = {
    idle:    { label: 'Idle',    color: 'text-muted-foreground', dot: 'bg-muted-foreground' },
    running: { label: 'Running', color: 'text-primary',          dot: 'bg-primary animate-pulse' },
    paused:  { label: 'Paused',  color: 'text-yellow-400',       dot: 'bg-yellow-400' },
    error:   { label: 'Error',   color: 'text-red-400',          dot: 'bg-red-400' },
    done:    { label: 'Done',    color: 'text-green-400',        dot: 'bg-green-400' },
  };
  const s = map[status];
  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export default function MultiAccountPanel() {
  const [accounts, setAccounts] = useState<XAccount[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = lsGet<XAccount[]>(LS_ACCOUNTS, []);
    if (saved.length === 0) {
      setAccounts([createDefaultAccount('Account 1')]);
    } else {
      setAccounts(saved.map(a => ({
        ...a,
        cyclePhase: a.cyclePhase ?? 'A',
        phasePostCount: a.phasePostCount ?? 0,
        // Keep status as-is so running accounts show correctly
      })));
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) lsSet(LS_ACCOUNTS, accounts);
  }, [accounts, mounted]);

  const handleAddAccount = useCallback(() => {
    if (accounts.length >= 30) {
      toast.error('Maximum 30 accounts supported');
      return;
    }
    const newAcc = createDefaultAccount(`Account ${accounts.length + 1}`);
    setAccounts(prev => [...prev, newAcc]);
    toast.success('Account added', { description: `Open "${newAcc.name}" to configure and start.` });
  }, [accounts.length]);

  const handleRemove = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const acc = accounts.find(a => a.id === id);
    if (acc?.status === 'running') {
      toast.error('Stop the account before removing it');
      return;
    }
    setAccounts(prev => {
      const found = prev.find(a => a.id === id);
      if (found) toast.info(`Removed "${found.name}"`);
      return prev.filter(a => a.id !== id);
    });
  }, [accounts]);

  const runningCount = accounts.filter(a => a.status === 'running').length;
  const pausedCount  = accounts.filter(a => a.status === 'paused').length;
  const doneCount    = accounts.filter(a => a.status === 'done').length;
  const totalTweets  = accounts.reduce((sum, a) => sum + a.tweetsPosted, 0);

  if (!mounted) {
    return (
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading accounts…</div>
      </div>
    );
  }

  return (
    <>
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{ style: { background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' } }}
      />

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-6">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-2">
            <LayoutGrid size={18} className="text-primary" />
            <h2 className="text-base font-bold text-foreground">Multi-Account Manager</h2>
            <span className="text-xs text-muted-foreground font-mono-data px-2 py-0.5 rounded"
              style={{ backgroundColor: 'var(--input)', border: '1px solid var(--border)' }}>
              up to 30 accounts
            </span>
          </div>

          {/* Global stats */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground ml-2 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Users size={12} />
              {accounts.length}/30 accounts
            </span>
            {runningCount > 0 && (
              <span className="flex items-center gap-1.5 text-primary font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
                {runningCount} running
              </span>
            )}
            {pausedCount > 0 && (
              <span className="flex items-center gap-1.5 text-yellow-400">
                <Pause size={11} />
                {pausedCount} paused
              </span>
            )}
            {doneCount > 0 && (
              <span className="flex items-center gap-1.5 text-green-400">
                <CheckCircle2 size={11} />
                {doneCount} done
              </span>
            )}
            {totalTweets > 0 && (
              <span className="flex items-center gap-1.5">
                <Activity size={11} />
                {totalTweets} tweets total
              </span>
            )}
          </div>

          <div className="ml-auto">
            <button
              type="button"
              className="btn-primary text-sm px-4 py-2 gap-2"
              onClick={handleAddAccount}
              disabled={accounts.length >= 30}
            >
              <PlusCircle size={15} />
              Add Account
            </button>
          </div>
        </div>

        {/* ── Info banner ─────────────────────────────────────────── */}
        <div className="mb-5 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <p className="text-xs text-blue-300">
            <strong>Each account has its own independent page</strong> — separate cookies, proxy, context, usernames, images, OpenRouter key, and cycle state.
            Click any account card to open its full control panel. All accounts run simultaneously without interrupting each other, 24/7 until tasks finish or you pause them.
          </p>
        </div>

        {/* ── Account grid ────────────────────────────────────────── */}
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 rounded-xl border border-dashed"
            style={{ borderColor: 'var(--border)' }}>
            <Users size={40} className="text-muted-foreground opacity-40" />
            <p className="text-muted-foreground text-sm">No accounts yet. Click "Add Account" to get started.</p>
            <button type="button" className="btn-primary text-sm px-5 py-2 gap-2" onClick={handleAddAccount}>
              <PlusCircle size={15} />
              Add First Account
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {accounts.map((acc, idx) => (
              <Link
                key={acc.id}
                href={`/account/${acc.id}`}
                className="group relative rounded-xl border transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 cursor-pointer block"
                style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
              >
                {/* Card header */}
                <div className="flex items-start justify-between p-4 pb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: 'var(--primary)', color: '#000' }}>
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{acc.name}</p>
                      <StatusBadge status={acc.status} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleRemove(acc.id, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 flex-shrink-0"
                    title="Remove account"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Stats */}
                <div className="px-4 pb-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg p-2 text-center" style={{ backgroundColor: 'var(--input)' }}>
                    <p className="text-xs text-muted-foreground">Tweets</p>
                    <p className="text-sm font-bold text-foreground">{acc.tweetsPosted}</p>
                  </div>
                  <div className="rounded-lg p-2 text-center" style={{ backgroundColor: 'var(--input)' }}>
                    <p className="text-xs text-muted-foreground">Cycles</p>
                    <p className="text-sm font-bold text-foreground">{acc.cycleCount}</p>
                  </div>
                </div>

                {/* Config indicators */}
                <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono-data ${acc.cookies ? 'text-green-400 bg-green-400/10' : 'text-muted-foreground bg-white/5'}`}>
                    {acc.cookies ? '✓ cookies' : '○ cookies'}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono-data ${acc.proxy ? 'text-green-400 bg-green-400/10' : 'text-muted-foreground bg-white/5'}`}>
                    {acc.proxy ? '✓ proxy' : '○ proxy'}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono-data ${acc.openRouterKey ? 'text-green-400 bg-green-400/10' : 'text-muted-foreground bg-white/5'}`}>
                    {acc.openRouterKey ? '✓ AI key' : '○ AI key'}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono-data ${acc.images.length > 0 ? 'text-green-400 bg-green-400/10' : 'text-muted-foreground bg-white/5'}`}>
                    {acc.images.length > 0 ? `✓ ${acc.images.length} img` : '○ images'}
                  </span>
                </div>

                {/* Phase indicator */}
                {acc.status !== 'idle' && (
                  <div className="px-4 pb-3">
                    <div className="text-xs text-muted-foreground font-mono-data">
                      Phase {acc.cyclePhase} · post {acc.phasePostCount}
                    </div>
                  </div>
                )}

                {/* Last activity */}
                {acc.lastCycleTime && (
                  <div className="px-4 pb-3 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock size={10} />
                    <span className="truncate">{acc.lastCycleTime}</span>
                  </div>
                )}

                {/* Open button */}
                <div className="px-4 pb-4">
                  <div className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-medium transition-all group-hover:bg-primary/10 group-hover:text-primary"
                    style={{ backgroundColor: 'var(--input)', color: 'var(--muted-foreground)' }}>
                    <ExternalLink size={12} />
                    Open Account
                  </div>
                </div>
              </Link>
            ))}

            {/* Add account card */}
            {accounts.length < 30 && (
              <button
                type="button"
                onClick={handleAddAccount}
                className="rounded-xl border border-dashed flex flex-col items-center justify-center gap-2 p-6 transition-all hover:border-primary/40 hover:bg-primary/5 min-h-[200px]"
                style={{ borderColor: 'var(--border)' }}
              >
                <PlusCircle size={24} className="text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Add Account</span>
                <span className="text-xs text-muted-foreground opacity-60">{30 - accounts.length} slots remaining</span>
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pb-6 flex items-center justify-center gap-2">
          <span className="text-xs text-muted-foreground font-mono-data">
            XAutomate · Multi-Account · {accounts.length} account{accounts.length !== 1 ? 's' : ''} · All run independently 24/7
          </span>
        </div>
      </div>
    </>
  );
}
