'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, CheckCircle, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { saveSession, type AccountSession } from '@/lib/accountSessions';

interface XBrowserLoginModalProps {
  accountId: string;
  proxy: string;
  onClose: () => void;
  onSessionCaptured: (session: AccountSession) => void;
}

type Step = 'idle' | 'waiting' | 'done' | 'error';

export default function XBrowserLoginModal({ accountId, proxy, onClose, onSessionCaptured }: XBrowserLoginModalProps) {
  const [step, setStep] = useState<Step>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (popupRef.current && !popupRef.current.closed) { popupRef.current.close(); popupRef.current = null; }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const startLogin = useCallback(async () => {
    setStep('waiting');
    setErrorMsg('');

    // 1. Tell the server which accountId this OAuth flow is for
    try {
      await fetch('/api/auth/set-pending-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, proxy }),
      });
    } catch {
      setErrorMsg('Could not reach the server. Check your connection.');
      setStep('error');
      return;
    }

    // 2. Open the Twitter/X OAuth popup
    const popup = window.open(
      '/api/auth/signin/twitter?callbackUrl=' + encodeURIComponent(window.location.href),
      'x_oauth_popup',
      'width=520,height=720,left=200,top=80,resizable=yes,scrollbars=yes'
    );

    if (!popup) {
      setErrorMsg('Popup was blocked. Please allow popups for this site and try again.');
      setStep('error');
      return;
    }
    popupRef.current = popup;

    // 3. Poll for session — check every second for up to 3 minutes
    let attempts = 0;
    const maxAttempts = 180;

    pollRef.current = setInterval(async () => {
      attempts++;

      // Popup closed by user before completing
      if (popup.closed) {
        clearInterval(pollRef.current!);
        if (step !== 'done') {
          setErrorMsg('Login window was closed. Please try again.');
          setStep('error');
        }
        return;
      }

      if (attempts > maxAttempts) {
        clearInterval(pollRef.current!);
        setErrorMsg('Login timed out. Please try again.');
        setStep('error');
        return;
      }

      // Check if NextAuth session now has our token
      try {
        const res = await fetch('/api/auth/session');
        if (!res.ok) return;
        const data = await res.json() as {
          user?: { name?: string; email?: string; image?: string };
          accessToken?: string;
          userId?: string;
          pendingAccountId?: string;
          expires?: string;
        };

        if (data?.accessToken && data?.pendingAccountId === accountId) {
          clearInterval(pollRef.current!);
          popup.close();

          const username = data.user?.name ?? data.userId ?? 'x_user';

          const session: AccountSession = {
            accountId,
            username,
            password: '',
            cookieJson: '',
            authToken: data.accessToken,
            ct0: '',
            proxy,
            loggedInAt: Date.now(),
            displayName: data.user?.name ?? username,
          };

          saveSession(session);
          onSessionCaptured(session);
          setStep('done');
        }
      } catch { /* keep polling */ }
    }, 1000);
  }, [accountId, proxy, onSessionCaptured, step]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) { cleanup(); onClose(); } }}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 flex flex-col gap-5"
        style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-primary" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span className="text-base font-bold text-foreground">Connect X Account</span>
          </div>
          <button
            type="button"
            onClick={() => { cleanup(); onClose(); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Idle — ready to start */}
        {step === 'idle' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Tap the button below. An X login window will open — just log in and you&apos;re done. No copy-pasting, no extra steps.
            </p>
            <button
              type="button"
              onClick={startLogin}
              className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl text-sm font-bold transition-all"
              style={{ backgroundColor: '#000', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Sign in with X
            </button>
          </div>
        )}

        {/* Waiting — popup is open, polling */}
        {step === 'waiting' && (
          <div className="flex flex-col gap-4 items-center text-center py-2">
            <div className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(0,212,170,0.1)', border: '2px solid rgba(0,212,170,0.25)' }}>
              <Loader2 size={26} className="animate-spin" style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">Waiting for you to log in…</p>
              <p className="text-sm text-muted-foreground mt-1">
                Complete the login in the popup window. This will close automatically once you&apos;re in.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { if (popupRef.current && !popupRef.current.closed) popupRef.current.focus(); }}
              className="text-xs font-medium transition-colors"
              style={{ color: 'var(--primary)' }}
            >
              Tap to bring the window to front
            </button>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="flex flex-col gap-4 items-center text-center py-2">
            <div className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(0,212,170,0.12)', border: '2px solid rgba(0,212,170,0.3)' }}>
              <CheckCircle size={28} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">Connected!</p>
              <p className="text-sm text-muted-foreground mt-1">Your X account is linked and ready to post.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: 'var(--primary)', color: '#000' }}
            >
              Done
            </button>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 p-3 rounded-xl text-sm"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => { setStep('idle'); setErrorMsg(''); }}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
            >
              <RefreshCw size={13} />
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
