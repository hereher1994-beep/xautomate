'use client';

import React, { useState, useEffect } from 'react';
import { LogOut, CheckCircle, RefreshCw } from 'lucide-react';
import { getSessionForAccount, removeSession, type AccountSession } from '@/lib/accountSessions';
import XBrowserLoginModal from './XBrowserLoginModal';

interface TwitterLoginCardProps {
  accountId: string;
  proxy: string;
  isRunning: boolean;
  onSessionChange?: (session: AccountSession | null) => void;
}

export default function TwitterLoginCard({ accountId, proxy, isRunning, onSessionChange }: TwitterLoginCardProps) {
  const [accountSession, setAccountSession] = useState<AccountSession | null>(null);
  const [showBrowserModal, setShowBrowserModal] = useState(false);

  useEffect(() => {
    const stored = getSessionForAccount(accountId);
    setAccountSession(stored);
    onSessionChange?.(stored);
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = () => {
    removeSession(accountId);
    setAccountSession(null);
    onSessionChange?.(null);
  };

  const handleRelogin = () => {
    setAccountSession(null);
    onSessionChange?.(null);
  };

  const handleBrowserSessionCaptured = (session: AccountSession) => {
    setAccountSession(session);
    onSessionChange?.(session);
    setShowBrowserModal(false);
  };

  const isLoggedIn = !!accountSession?.authToken;

  return (
    <div className="config-card">
      {showBrowserModal && (
        <XBrowserLoginModal
          accountId={accountId}
          proxy={proxy}
          onClose={() => setShowBrowserModal(false)}
          onSessionCaptured={handleBrowserSessionCaptured}
        />
      )}

      <div className="flex items-center gap-2 mb-3">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-primary" aria-hidden="true">
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
          <div className="flex items-center gap-2.5 p-2.5 rounded-lg"
            style={{ backgroundColor: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.15)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ backgroundColor: 'rgba(0,212,170,0.15)', color: 'var(--primary)' }}>
              {(accountSession!.displayName ?? accountSession!.username).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                @{accountSession!.username}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <CheckCircle size={11} className="text-primary flex-shrink-0" />
                <span className="text-xs" style={{ color: 'var(--primary)' }}>Session active</span>
              </div>
            </div>
          </div>

          {accountSession!.proxy && (
            <p className="text-xs text-muted-foreground">
              🛡 Proxy: <span className="font-mono-data text-foreground">
                {accountSession!.proxy.replace(/:[^:@]+@/, ':***@')}
              </span>
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRelogin}
              disabled={isRunning}
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
              Re-login
            </button>
            <button
              type="button"
              onClick={handleLogout}
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
            Tap below — log in on X and you&apos;re done. No copy-pasting needed.
          </p>
          <button
            type="button"
            onClick={() => setShowBrowserModal(true)}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl text-sm font-bold transition-all"
            style={{ backgroundColor: '#000', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Sign in with X
          </button>
          <p className="text-xs text-red-400">⚠ Login required before starting automation.</p>
        </div>
      )}
    </div>
  );
}
