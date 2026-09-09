'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ExternalLink, CheckCircle, Loader2, AlertCircle, Copy, RefreshCw } from 'lucide-react';
import { saveSession, type AccountSession } from '@/lib/accountSessions';

interface XBrowserLoginModalProps {
  accountId: string;
  proxy: string;
  onClose: () => void;
  onSessionCaptured: (session: AccountSession) => void;
}

type Step = 'open' | 'waiting' | 'capturing' | 'done' | 'error';

export default function XBrowserLoginModal({ accountId, proxy, onClose, onSessionCaptured }: XBrowserLoginModalProps) {
  const [step, setStep] = useState<Step>('open');
  const [errorMsg, setErrorMsg] = useState('');
  const [captureToken] = useState(() => `xam_${accountId}_${Date.now()}`);
  const [copied, setCopied] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // The script the user runs in the popup console to send cookies to our API
  const captureScript = `fetch('${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/capture-cookies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'${captureToken}',cookies:document.cookie})}).then(r=>r.json()).then(d=>alert(d.ok?'✅ Session captured! Go back to XAutomate.':'❌ Failed: '+d.error))`;

  const openPopup = useCallback(() => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
      return;
    }
    const popup = window.open(
      'https://x.com/login',
      'x_login_popup',
      'width=500,height=700,left=200,top=100,resizable=yes,scrollbars=yes'
    );
    if (!popup) {
      setErrorMsg('Popup was blocked by your browser. Please allow popups for this site and try again.');
      setStep('error');
      return;
    }
    popupRef.current = popup;
    setStep('waiting');
  }, []);

  const copyScript = useCallback(() => {
    navigator.clipboard.writeText(captureScript).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [captureScript]);

  const startCapture = useCallback(() => {
    setStep('capturing');
    // Poll the server for the captured session
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(pollRef.current!);
        setErrorMsg('Timed out waiting for session. Please try again.');
        setStep('error');
        return;
      }
      try {
        const res = await fetch(`/api/auth/capture-cookies?token=${captureToken}`);
        if (!res.ok) return;
        const data = await res.json() as { ok: boolean; cookieJson?: string; authToken?: string; ct0?: string; username?: string; error?: string };
        if (data.ok && data.authToken) {
          clearInterval(pollRef.current!);
          const session: AccountSession = {
            accountId,
            username: data.username ?? 'x_user',
            password: '',
            cookieJson: data.cookieJson ?? '',
            authToken: data.authToken,
            ct0: data.ct0 ?? '',
            proxy,
            loggedInAt: Date.now(),
            displayName: data.username ?? 'X User',
          };
          saveSession(session);
          onSessionCaptured(session);
          setStep('done');
          if (popupRef.current && !popupRef.current.closed) {
            popupRef.current.close();
          }
        }
      } catch { /* keep polling */ }
    }, 1000);
  }, [captureToken, accountId, proxy, onSessionCaptured]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-6 flex flex-col gap-5"
        style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-primary" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span className="text-base font-bold text-foreground">Login with X Browser</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Step: Open */}
        {step === 'open' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              This will open a real X.com login window in your browser. Log in with your account, then follow the steps to capture your session.
            </p>
            <div className="flex flex-col gap-2 p-3 rounded-xl text-xs text-muted-foreground"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: 'rgba(0,212,170,0.15)', color: 'var(--primary)' }}>1</span>
                <span>Click <strong className="text-foreground">Open X Login</strong> — a popup window opens x.com</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: 'rgba(0,212,170,0.15)', color: 'var(--primary)' }}>2</span>
                <span>Log in to your X account in that window</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: 'rgba(0,212,170,0.15)', color: 'var(--primary)' }}>3</span>
                <span>Come back here and click <strong className="text-foreground">I&apos;m Logged In</strong></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: 'rgba(0,212,170,0.15)', color: 'var(--primary)' }}>4</span>
                <span>Run the capture script in the popup console — session saved automatically</span>
              </div>
            </div>
            <button
              type="button"
              onClick={openPopup}
              className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all"
              style={{ backgroundColor: '#000', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <ExternalLink size={15} />
              Open X Login Window
            </button>
          </div>
        )}

        {/* Step: Waiting for user to log in */}
        {step === 'waiting' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 p-3 rounded-xl"
              style={{ backgroundColor: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.2)' }}>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--primary)' }} />
              <span className="text-sm text-foreground font-medium">X login window is open</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Log in to your X account in the popup window, then come back here and click the button below.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (popupRef.current && !popupRef.current.closed) popupRef.current.focus();
                }}
                className="flex items-center justify-center gap-2 flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
              >
                <ExternalLink size={13} />
                Focus Window
              </button>
              <button
                type="button"
                onClick={startCapture}
                className="flex items-center justify-center gap-2 flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all"
                style={{ backgroundColor: 'var(--primary)', color: '#000' }}
              >
                <CheckCircle size={13} />
                I&apos;m Logged In →
              </button>
            </div>
            <button
              type="button"
              onClick={() => setStep('open')}
              className="text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
            >
              ← Reopen window
            </button>
          </div>
        )}

        {/* Step: Capturing — show script */}
        {step === 'capturing' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Loader2 size={15} className="animate-spin text-primary" />
              <span className="text-sm font-medium text-foreground">Waiting for session capture…</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              In the X popup window, open the browser console (<strong className="text-foreground">F12 → Console</strong>), paste the script below and press Enter:
            </p>
            <div className="relative">
              <pre
                className="text-xs p-3 rounded-xl overflow-x-auto leading-relaxed"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--border)',
                  color: '#a8d8a8',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {captureScript}
              </pre>
              <button
                type="button"
                onClick={copyScript}
                className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  backgroundColor: copied ? 'rgba(0,212,170,0.2)' : 'rgba(255,255,255,0.08)',
                  color: copied ? 'var(--primary)' : 'var(--muted-foreground)',
                  border: '1px solid var(--border)',
                }}
              >
                {copied ? <CheckCircle size={11} /> : <Copy size={11} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              After running the script, you&apos;ll see a confirmation alert. The session will be captured automatically.
            </p>
            <button
              type="button"
              onClick={() => {
                if (popupRef.current && !popupRef.current.closed) popupRef.current.focus();
              }}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-xl text-sm font-medium transition-colors"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
            >
              <ExternalLink size={13} />
              Focus X Window
            </button>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="flex flex-col gap-4 items-center text-center py-2">
            <div className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(0,212,170,0.12)', border: '2px solid rgba(0,212,170,0.3)' }}>
              <CheckCircle size={28} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">Session Captured!</p>
              <p className="text-sm text-muted-foreground mt-1">Your X account is now connected and ready to post.</p>
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

        {/* Step: Error */}
        {step === 'error' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 p-3 rounded-xl text-sm"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => { setStep('open'); setErrorMsg(''); }}
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
