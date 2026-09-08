'use client';

import React, { useState } from 'react';
import { Shield, Eye, EyeOff, CheckCircle2, AlertCircle, Wifi } from 'lucide-react';

interface ProxyConfigCardProps {
  value: string;
  onChange: (v: string) => void;
  isRunning: boolean;
}

export default function ProxyConfigCard({ value, onChange, isRunning }: ProxyConfigCardProps) {
  const [showProxy, setShowProxy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  // BACKEND INTEGRATION: Replace with actual proxy connectivity test
  const handleTestProxy = async () => {
    if (!value.trim()) return;
    setTesting(true);
    setTestResult(null);
    await new Promise(r => setTimeout(r, 1800));
    setTestResult(value.includes('://') ? 'success' : 'error');
    setTesting(false);
  };

  const proxyDisplay = showProxy ? value : value.replace(/:[^:@]+@/, ':***@');

  return (
    <div className="config-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield size={15} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Proxy Configuration</span>
        </div>
        {testResult === 'success' && (
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--primary)' }}>
            <CheckCircle2 size={12} />
            <span>Connected</span>
          </div>
        )}
        {testResult === 'error' && (
          <div className="flex items-center gap-1 text-xs text-red-400">
            <AlertCircle size={12} />
            <span>Failed</span>
          </div>
        )}
      </div>

      <label className="config-label">Proxy URL</label>
      <p className="text-xs text-muted-foreground mb-2">
        Format: <span className="font-mono-data text-xs">http://user:pass@host:port</span> or <span className="font-mono-data text-xs">socks5://host:port</span>
      </p>

      <div className="relative">
        <input
          type={showProxy ? 'text' : 'password'}
          className="config-input pr-20 font-mono-data text-xs"
          placeholder="http://user:pass@proxy.example.com:8080"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={isRunning}
          spellCheck={false}
          autoComplete="off"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          <button
            type="button"
            className="btn-icon"
            onClick={() => setShowProxy(p => !p)}
            aria-label={showProxy ? 'Hide proxy' : 'Show proxy'}
          >
            {showProxy ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Leave empty to use direct connection.
        </p>
        <button
          type="button"
          className="btn-secondary text-xs py-1 px-2.5 gap-1.5"
          onClick={handleTestProxy}
          disabled={!value.trim() || testing || isRunning}
        >
          {testing ? (
            <>
              <Wifi size={12} className="animate-pulse" />
              Testing…
            </>
          ) : (
            <>
              <Wifi size={12} />
              Test Proxy
            </>
          )}
        </button>
      </div>

      {!value.trim() && (
        <div className="mt-2 flex items-start gap-1.5 p-2 rounded"
          style={{ backgroundColor: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <AlertCircle size={12} className="text-accent mt-0.5 flex-shrink-0" />
          <p className="text-xs" style={{ color: 'var(--accent)' }}>
            No proxy set — direct connection. Your real IP will be used.
          </p>
        </div>
      )}
    </div>
  );
}