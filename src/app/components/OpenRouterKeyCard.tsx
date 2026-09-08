'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, Key, Check, AlertTriangle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const LS_KEY = 'xautomate_openrouter_key';

interface OpenRouterKeyCardProps {
  value: string;
  onChange: (v: string) => void;
  isRunning: boolean;
}

export default function OpenRouterKeyCard({ value, onChange, isRunning }: OpenRouterKeyCardProps) {
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  const isValid = value.trim().startsWith('sk-or-');
  const hasValue = value.trim().length > 0;

  const handleSave = () => {
    try {
      localStorage.setItem(LS_KEY, value.trim());
      setSaved(true);
      toast.success('OpenRouter API key saved');
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error('Failed to save key');
    }
  };

  const displayValue = show ? value : value.replace(/./g, (c, i) => i < 8 ? c : '•');

  return (
    <div className="config-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Key size={15} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">OpenRouter API Key</span>
          <span className="text-xs text-accent font-medium">Required for AI</span>
        </div>
        {hasValue && (
          <div className={`flex items-center gap-1 text-xs ${isValid ? 'text-primary' : 'text-accent'}`}>
            {isValid ? (
              <><ShieldCheck size={12} /><span>Valid key format</span></>
            ) : (
              <><AlertTriangle size={12} /><span>Should start with sk-or-</span></>
            )}
          </div>
        )}
      </div>

      <label className="config-label">API Key</label>
      <p className="text-xs text-muted-foreground mb-2">
        Get your key from{' '}
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:opacity-80"
        >
          openrouter.ai/keys
        </a>
        . Your key is stored locally in your browser only.
      </p>

      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            className="config-input pr-10 font-mono text-xs w-full"
            placeholder="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={displayValue}
            onChange={e => {
              const raw = e.target.value;
              // If user is typing (not the masked version), update directly
              onChange(raw.includes('•') ? value : raw);
            }}
            onFocus={() => setShow(true)}
            onBlur={() => setShow(false)}
            disabled={isRunning}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="btn-icon absolute right-1.5 top-1/2 -translate-y-1/2"
            onClick={() => setShow(p => !p)}
            aria-label={show ? 'Hide key' : 'Show key'}
          >
            {show ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        <button
          type="button"
          className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5 shrink-0"
          onClick={handleSave}
          disabled={!hasValue || isRunning}
          aria-label="Save API key"
        >
          {saved ? <Check size={13} className="text-primary" /> : <Key size={13} />}
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {!hasValue && (
        <p className="mt-2 text-xs text-accent">
          ⚠ An OpenRouter API key is required to generate unique AI tweets. Without it, the static context template will be used as fallback.
        </p>
      )}

      {hasValue && !isValid && (
        <p className="mt-2 text-xs text-accent">
          ⚠ OpenRouter keys typically start with <span className="font-mono-data">sk-or-</span>. Double-check your key.
        </p>
      )}

      {hasValue && isValid && (
        <p className="mt-2 text-xs text-muted-foreground">
          ✓ AI will generate a unique tweet variation for every single post during automation.
        </p>
      )}
    </div>
  );
}
