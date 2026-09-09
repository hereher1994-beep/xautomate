'use client';

import React from 'react';
import { signIn } from 'next-auth/react';
import AppLogo from '@/components/ui/AppLogo';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: 'var(--background)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <AppLogo size={48} />
          <h1 className="mt-3 text-2xl font-bold text-foreground tracking-tight">XAutomate</h1>
          <p className="mt-1 text-sm text-muted-foreground">Automated X posting, powered by your account</p>
        </div>

        {/* Login card */}
        <div className="config-card flex flex-col gap-4">
          <div className="text-center">
            <h2 className="text-base font-semibold text-foreground">Sign in to continue</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Connect your X account once — stay logged in forever.
            </p>
          </div>

          <button
            onClick={() => signIn('twitter', { callbackUrl: '/' })}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg font-semibold text-sm transition-all"
            style={{
              backgroundColor: '#000',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            {/* X logo */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Sign in with X
          </button>

          <p className="text-center text-xs text-muted-foreground">
            Grants <span className="text-foreground font-medium">tweet.write</span> permission so XAutomate can post on your behalf.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Your credentials are never stored — only the OAuth token is kept in your session.
        </p>
      </div>
    </div>
  );
}
