'use client';

import React, { useState, useEffect } from 'react';
import { LogOut, CheckCircle, RefreshCw, Eye, EyeOff, Loader2, AlertCircle, User, Lock } from 'lucide-react';
import { saveSession, getSessionForAccount, removeSession, type AccountSession } from '@/lib/accountSessions';

interface TwitterLoginCardProps {
  accountId: string;
  proxy: string;
  isRunning: boolean;
  onSessionChange?: (session: AccountSession | null) => void;
}

export default function TwitterLoginCard({ accountId, proxy, isRunning, onSessionChange }: TwitterLoginCardProps) {
  const [accountSession, setAccountSession] = useState<AccountSession | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    const stored = getSessionForAccount(accountId);
    setAccountSession(stored);
    onSessionChange?.(stored);
    if (stored?.username) setUsername(stored.username);
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        body: JSON.stringify({ username: username.trim(), password, proxy: proxy || undefined }),
      });
      const data = await res.json() as {
        ok: boolean;
        cookieJson?: string;
        authToken?: string;
        ct0?: string;
        displayName?: string;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setLoginError(data.error ?? 'Login failed. Check your credentials.');
        return;
      }

      const newSession: AccountSession = {
        accountId,
        username: username.trim(),
        password,
        cookieJson: data.cookieJson ?? '',
        authToken: data.authToken ?? '',
        ct0: data.ct0 ?? '',
        proxy,
        loggedInAt: Date.now(),
        displayName: data.displayName ?? username.trim(),
      };

      saveSession(newSession);
      setAccountSession(newSession);
      onSessionChange?.(newSession);
      setPassword('');
    } catch {
      setLoginError('Network error. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    removeSession(accountId);
    setAccountSession(null);
    onSessionChange?.(null);
    setPassword('');
    setLoginError('');
  };

  const handleRelogin = () => {
    setAccountSession(null);
    onSessionChange?.(null);
    setLoginError('');
  };

  const isLoggedIn = !!accountSession?.authToken;

  return (
    <div className="config-card">
      <div className="flex items-center gap-2 mb-3">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-primary" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        <span className="text-sm font-semibold text-foreground">X Account Login</span>
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
                <span className="text-xs" style={{ color: 'var(--primary)' }}>
                  Browser session active
                </span>
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

          <p className="text-xs text-muted-foreground">
            Tweets will be posted as <span className="text-foreground font-medium">@{accountSession!.username}</span> using your browser session.
          </p>

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
            Enter your X username and password. The app logs in once through a real browser session and keeps you signed in — no API keys needed.
            {proxy && (
              <span className="block mt-1 text-primary">
                🛡 Will connect via proxy: <span className="font-mono-data">{proxy.replace(/:[^:@]+@/, ':***@')}</span>
              </span>
            )}
          </p>

          {/* Username */}
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

          {/* Password */}
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
            type="button"
            onClick={handleLogin}
            disabled={isLoggingIn || !username.trim() || !password.trim()}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-lg text-sm font-semibold transition-all"
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
                <Loader2 size={14} className="animate-spin" />
                Logging in via browser…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Login with X
              </>
            )}
          </button>

          <p className="text-xs text-red-400">
            ⚠ You must log in before starting automation.
          </p>
        </div>
      )}
    </div>
  );
}
