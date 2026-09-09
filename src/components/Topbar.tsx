'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import { loadAllSessions, type AccountSession } from '@/lib/accountSessions';

export default function Topbar() {
  const [sessions, setSessions] = useState<AccountSession[]>([]);

  useEffect(() => {
    setSessions(loadAllSessions());
    // Refresh when localStorage changes (e.g. another tab logs in)
    const onStorage = () => setSessions(loadAllSessions());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const loggedInCount = sessions.length;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6 border-b border-border"
      style={{ backgroundColor: 'rgba(10, 10, 15, 0.92)', backdropFilter: 'blur(12px)' }}>
      <div className="flex items-center gap-2.5">
        <Link href="/" className="flex items-center gap-2.5">
          <AppLogo size={28} />
          <span className="font-semibold text-base tracking-tight text-foreground">
            XAutomate
          </span>
        </Link>
        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-mono-data font-medium"
          style={{ backgroundColor: 'rgba(0,212,170,0.1)', color: 'var(--primary)', border: '1px solid rgba(0,212,170,0.2)' }}>
          v0.2-exp
        </span>
      </div>

      <nav className="flex items-center gap-1">
        <Link
          href="/accounts"
          className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded transition-colors hover:bg-secondary"
        >
          Accounts
        </Link>
        <Link
          href="/deploy"
          className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded transition-colors hover:bg-secondary"
        >
          Deploy
        </Link>
        <div className="w-px h-4 bg-border mx-1" />

        {loggedInCount > 0 ? (
          <div className="flex items-center gap-2">
            {/* Show up to 3 account avatars */}
            <div className="flex items-center -space-x-1.5">
              {sessions.slice(0, 3).map(s => (
                s.twitterImage ? (
                  <img
                    key={s.accountId}
                    src={s.twitterImage}
                    alt={`${s.twitterName} profile`}
                    className="w-6 h-6 rounded-full ring-1 ring-background"
                    title={`@${s.twitterName}`}
                  />
                ) : (
                  <div key={s.accountId}
                    className="w-6 h-6 rounded-full ring-1 ring-background flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: 'var(--primary)', color: '#000' }}
                    title={`@${s.twitterName}`}
                  >
                    {s.twitterName?.[0]?.toUpperCase() ?? 'X'}
                  </div>
                )
              ))}
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--primary)' }}>
              {loggedInCount} account{loggedInCount !== 1 ? 's' : ''} connected
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <Link href="/accounts" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              No accounts signed in
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}