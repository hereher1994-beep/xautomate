'use client';

import React from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import AppLogo from '@/components/ui/AppLogo';

export default function Topbar() {
  const { data: session } = useSession();
  const isLoggedIn = !!(session as any)?.accessToken;

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

        {isLoggedIn ? (
          <div className="flex items-center gap-2">
            {session?.user?.image && (
              <img
                src={session.user.image}
                alt={`${session.user.name} profile`}
                className="w-6 h-6 rounded-full"
              />
            )}
            <span className="text-xs text-foreground font-medium hidden sm:inline">
              {session?.user?.name}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors hover:bg-secondary"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Sign in
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}