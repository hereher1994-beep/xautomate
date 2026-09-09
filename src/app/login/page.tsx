'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, AlertCircle, User, Lock } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setLoginError('Enter your X username and password.');
      return;
    }
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth/browser-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setLoginError(data.error ?? 'Login failed. Check your credentials.');
        return;
      }
      router.push('/');
    } catch {
      setLoginError('Network error. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: 'var(--background)' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <AppLogo size={48} />
          <h1 className="mt-3 text-2xl font-bold text-foreground tracking-tight">XAutomate</h1>
          <p className="mt-1 text-sm text-muted-foreground">Automated X posting, powered by your account</p>
        </div>

        <div className="config-card flex flex-col gap-4">
          <div className="text-center">
            <h2 className="text-base font-semibold text-foreground">Sign in with X</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Enter your X credentials. The app logs in once and keeps your session active.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="config-label">Username or Email</label>
            <div className="relative">
              <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                className="config-input pl-8"
                placeholder="@username or email"
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={isLoggingIn}
                autoComplete="username"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="config-label">Password</label>
            <div className="relative">
              <Lock size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPassword ? 'text' : 'password'}
                className="config-input pl-8 pr-9"
                placeholder="Your X password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={isLoggingIn}
                autoComplete="current-password"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(p => !p)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          {loginError && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg text-xs"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={isLoggingIn || !username.trim() || !password.trim()}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg font-semibold text-sm transition-all"
            style={{
              backgroundColor: '#000',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)',
              opacity: (isLoggingIn || !username.trim() || !password.trim()) ? 0.6 : 1,
              cursor: (isLoggingIn || !username.trim() || !password.trim()) ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoggingIn ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Logging in…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Login with X
              </>
            )}
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Your credentials are used only to establish a browser session — no API keys required.
        </p>
      </div>
    </div>
  );
}
