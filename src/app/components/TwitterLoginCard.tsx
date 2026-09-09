'use client';

import React, { useEffect, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { LogOut, CheckCircle, RefreshCw } from 'lucide-react';
import { saveSession, getSessionForAccount, removeSession, type AccountSession } from '@/lib/accountSessions';

interface TwitterLoginCardProps {
  /** The account this card is bound to */
  accountId: string;
  /** The proxy configured for this account — used before OAuth redirect */
  proxy: string;
  isRunning: boolean;
  /** Called when the session for this account changes */
  onSessionChange?: (session: AccountSession | null) => void;
}

export default function TwitterLoginCard({ accountId, proxy, isRunning, onSessionChange }: TwitterLoginCardProps) {
  const { data: nextAuthSession } = useSession();
  const [accountSession, setAccountSession] = useState<AccountSession | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // On mount and when nextAuthSession changes, check if we just completed OAuth for this account
  useEffect(() => {
    const stored = getSessionForAccount(accountId);
    setAccountSession(stored);
    onSessionChange?.(stored);
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When NextAuth session arrives after OAuth, check if it belongs to this account
  useEffect(() => {
    const ns = nextAuthSession as any;
    if (!ns?.accessToken) return;

    const pendingId = ns.pendingAccountId;
    // If this session was initiated for this account (or no pending id — legacy)
    if (pendingId && pendingId !== accountId) return;

    // Save/update the session for this account
    const newSession: AccountSession = {
      accountId,
      accessToken: ns.accessToken,
      twitterUserId: ns.userId ?? '',
      twitterName: ns.user?.name ?? '',
      twitterImage: ns.user?.image ?? '',
      proxy: ns.pendingProxy ?? proxy,
      loggedInAt: Date.now(),
    };

    saveSession(newSession);
    setAccountSession(newSession);
    onSessionChange?.(newSession);
  }, [nextAuthSession, accountId, proxy, onSessionChange]);

  const handleSignIn = async () => {
    setIsConnecting(true);
    try {
      // Store accountId + proxy in cookies before OAuth redirect
      await fetch('/api/auth/set-pending-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, proxy }),
      });
      // Redirect to Twitter OAuth
      await signIn('twitter', { callbackUrl: window.location.href });
    } catch {
      setIsConnecting(false);
    }
  };

  const handleSignOut = () => {
    removeSession(accountId);
    setAccountSession(null);
    onSessionChange?.(null);
    // Only sign out of NextAuth if this was the active session
    const ns = nextAuthSession as any;
    if (ns?.accessToken && (ns.pendingAccountId === accountId || !ns.pendingAccountId)) {
      signOut({ redirect: false });
    }
  };

  const isLoggedIn = !!accountSession?.accessToken;

  return (
    <div className="config-card">
      <div className="flex items-center gap-2 mb-3">
        {/* X icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"
          className="text-primary" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        <span className="text-sm font-semibold text-foreground">X Account</span>
        {isLoggedIn ? (
          <span className="text-xs font-medium" style={{ color: 'var(--primary)' }}>Connected</span>
        ) : (
          <span className="text-xs text-red-400 font-medium">Required</span>
        )}
      </div>

      {isLoggedIn ? (
        <div className="flex flex-col gap-3">
          {/* User info */}
          <div className="flex items-center gap-2.5 p-2.5 rounded-lg"
            style={{ backgroundColor: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.15)' }}>
            {accountSession!.twitterImage && (
              <img
                src={accountSession!.twitterImage}
                alt={`${accountSession!.twitterName} profile picture`}
                className="w-8 h-8 rounded-full"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{accountSession!.twitterName}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <CheckCircle size={11} className="text-primary flex-shrink-0" />
                <span className="text-xs" style={{ color: 'var(--primary)' }}>OAuth 2.0 · tweet.write active</span>
              </div>
            </div>
          </div>

          {accountSession!.proxy && (
            <p className="text-xs text-muted-foreground">
              🛡 Proxy: <span className="font-mono-data text-foreground">{accountSession!.proxy.replace(/:[^:@]+@/, ':***@')}</span>
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Tweets will be posted as <span className="text-foreground font-medium">@{accountSession!.twitterName}</span> using your OAuth token.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isRunning || isConnecting}
              className="flex items-center justify-center gap-2 flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'rgba(0,212,170,0.08)',
                color: 'var(--primary)',
                border: '1px solid rgba(0,212,170,0.2)',
                cursor: isRunning ? 'not-allowed' : 'pointer',
                opacity: isRunning ? 0.5 : 1,
              }}
            >
              <RefreshCw size={12} />
              Re-authenticate
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isRunning}
              className="flex items-center justify-center gap-2 flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'rgba(239,68,68,0.08)',
                color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.2)',
                cursor: isRunning ? 'not-allowed' : 'pointer',
                opacity: isRunning ? 0.5 : 1,
              }}
            >
              <LogOut size={12} />
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Sign in with your X account once. Your session stays active — no more pasting cookies.
            {proxy && (
              <span className="block mt-1 text-primary">
                🛡 Will connect via proxy: <span className="font-mono-data">{proxy.replace(/:[^:@]+@/, ':***@')}</span>
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={handleSignIn}
            disabled={isConnecting}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-lg text-sm font-semibold transition-all"
            style={{
              backgroundColor: '#000',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)',
              opacity: isConnecting ? 0.7 : 1,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            {isConnecting ? 'Connecting…' : 'Sign in with X'}
          </button>
          <p className="text-xs text-red-400">
            ⚠ You must sign in before starting automation.
          </p>
        </div>
      )}
    </div>
  );
}
