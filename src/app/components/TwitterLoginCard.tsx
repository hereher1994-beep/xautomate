'use client';

import React from 'react';
import { signIn, signOut } from 'next-auth/react';
import { LogOut, CheckCircle } from 'lucide-react';

interface TwitterLoginCardProps {
  session: any;
  isRunning: boolean;
}

export default function TwitterLoginCard({ session, isRunning }: TwitterLoginCardProps) {
  const isLoggedIn = !!session?.accessToken;
  const userName = session?.user?.name;
  const userImage = session?.user?.image;

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
            {userImage && (
              <img
                src={userImage}
                alt={`${userName} profile picture`}
                className="w-8 h-8 rounded-full"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{userName}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <CheckCircle size={11} className="text-primary flex-shrink-0" />
                <span className="text-xs" style={{ color: 'var(--primary)' }}>OAuth 2.0 · tweet.write active</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Tweets will be posted as <span className="text-foreground font-medium">@{userName}</span> using your OAuth token. No cookies needed.
          </p>

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            disabled={isRunning}
            className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg text-xs font-medium transition-colors"
            style={{
              backgroundColor: 'rgba(239,68,68,0.08)',
              color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.2)',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              opacity: isRunning ? 0.5 : 1,
            }}
          >
            <LogOut size={12} />
            Sign out
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Sign in with your X account once. Your session stays active — no more pasting cookies.
          </p>
          <button
            type="button"
            onClick={() => signIn('twitter', { callbackUrl: '/' })}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-lg text-sm font-semibold transition-all"
            style={{
              backgroundColor: '#000',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Sign in with X
          </button>
          <p className="text-xs text-red-400">
            ⚠ You must sign in before starting automation.
          </p>
        </div>
      )}
    </div>
  );
}
