'use client';

import React, { useState } from 'react';
import { Cookie, Eye, EyeOff, Copy, Check, AlertTriangle, ShieldCheck, ClipboardPaste } from 'lucide-react';
import { toast } from 'sonner';
import { parseCookieJson } from '../types/automation';

interface SessionCookiesCardProps {
  value: string;
  onChange: (v: string) => void;
  isRunning: boolean;
}

export default function SessionCookiesCard({ value, onChange, isRunning }: SessionCookiesCardProps) {
  const [showCookies, setShowCookies] = useState(false);
  const [copied, setCopied] = useState(false);

  // Try to parse as JSON; show health info
  const parsed = value.trim() ? parseCookieJson(value) : null;
  const isValidJson = value.trim() ? (() => { try { const a = JSON.parse(value); return Array.isArray(a); } catch { return false; } })() : null;

  const health = parsed && parsed.count > 0
    ? {
        valid: parsed.hasAuthToken && parsed.hasCt0,
        fields: [
          parsed.hasAuthToken && 'auth_token',
          parsed.hasCt0 && 'ct0',
          parsed.hasTwid && 'twid',
        ].filter(Boolean) as string[],
        count: parsed.count,
      }
    : null;

  const handleCopy = async () => {
    if (!value.trim()) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success('Cookies copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const maskedValue = showCookies
    ? value
    : value.replace(/"value"\s*:\s*"[^"]*"/g, '"value":"***"');

  return (
    <div className="config-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cookie size={15} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Session Cookies</span>
          <span className="text-xs text-red-400 font-medium">Required</span>
        </div>
        {value.trim() && (
          <div className={`flex items-center gap-1 text-xs ${
            !isValidJson ? 'text-accent' : health?.valid ?'text-primary' : 'text-accent'
          }`}>
            {!isValidJson ? (
              <><AlertTriangle size={12} /><span>Invalid JSON</span></>
            ) : health?.valid ? (
              <><ShieldCheck size={12} /><span>Valid ({health.count} cookies)</span></>
            ) : (
              <><AlertTriangle size={12} /><span>Incomplete</span></>
            )}
          </div>
        )}
      </div>

      <label className="config-label">X Account Cookies (JSON)</label>
      <p className="text-xs text-muted-foreground mb-2">
        In Cookie-Editor, click <span className="font-mono-data">Export</span> → <span className="font-mono-data">JSON</span> and paste the full array here.
      </p>

      <div className="relative">
        <textarea
          className="config-textarea pr-16 min-h-[110px] font-mono text-xs"
          placeholder={`[\n  {"name":"auth_token","value":"abc123",...},\n  {"name":"ct0","value":"xyz789",...}\n]`}
          value={showCookies ? value : maskedValue}
          onChange={e => onChange(e.target.value)}
          disabled={isRunning}
          spellCheck={false}
          autoComplete="off"
          rows={4}
          onFocus={() => setShowCookies(true)}
          onBlur={() => setShowCookies(false)}
        />
        <div className="absolute right-1.5 top-1.5 flex flex-col gap-0.5">
          <button
            type="button"
            className="btn-icon"
            onClick={() => setShowCookies(p => !p)}
            aria-label={showCookies ? 'Hide cookies' : 'Show cookies'}
          >
            {showCookies ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={handleCopy}
            disabled={!value.trim()}
            aria-label="Copy cookies"
          >
            {copied ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
          </button>
        </div>
      </div>

      {health && health.fields.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {health.fields.map(f => (
            <span key={`cookie-field-${f}`}
              className="font-mono-data text-xs px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'rgba(0,212,170,0.08)', color: 'var(--primary)', border: '1px solid rgba(0,212,170,0.2)' }}>
              {f}
            </span>
          ))}
          {!health.valid && (
            <span className="text-xs text-accent">— missing auth_token or ct0</span>
          )}
          {health.count > 3 && (
            <span className="text-xs text-muted-foreground">+{health.count - health.fields.length} more</span>
          )}
        </div>
      )}

      {value.trim() && !isValidJson && (
        <p className="mt-2 text-xs text-accent">
          ⚠ Paste the full JSON array from Cookie-Editor → Export → JSON. It should start with <span className="font-mono-data">[</span> and end with <span className="font-mono-data">]</span>.
        </p>
      )}

      {!value.trim() && (
        <p className="mt-2 text-xs text-red-400">
          Session cookies are required to authenticate requests.
        </p>
      )}

      <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
        <ClipboardPaste size={11} />
        Cookie-Editor → Export → <span className="font-mono-data">JSON</span> → paste the entire output above.
      </p>
    </div>
  );
}