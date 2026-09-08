'use client';

import React, { useState } from 'react';
import { MessageSquare, Hash, RotateCcw } from 'lucide-react';

interface ContextTemplateCardProps {
  value: string;
  onChange: (v: string) => void;
  isRunning: boolean;
}

const EXAMPLE_TEMPLATES = [
  'Interesting perspective on {topic}. Have you considered the implications for {domain}?',
  'Great insight! This connects well with recent developments in the space.',
  'Curious about your take on the long-term trajectory here. What\'s your 6-month outlook?',
  'This resonates — been seeing similar patterns. Worth a deeper thread.',
];

export default function ContextTemplateCard({ value, onChange, isRunning }: ContextTemplateCardProps) {
  const [showExamples, setShowExamples] = useState(false);
  const charCount = value.length;
  const isOverLimit = charCount > 280;

  return (
    <div className="config-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Context Template</span>
          <span className="text-xs text-red-400 font-medium">Required</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-mono-data text-xs ${isOverLimit ? 'text-red-400' : 'text-muted-foreground'}`}>
            {charCount}/280
          </span>
        </div>
      </div>

      <label className="config-label">Message / Context</label>
      <p className="text-xs text-muted-foreground mb-2">
        The content or context sent each cycle. Use <span className="font-mono-data text-xs">{'{username}'}</span> to interpolate the target handle.
      </p>

      <textarea
        className="config-textarea min-h-[100px]"
        placeholder="e.g. Interesting perspective on {topic}. What's your take on the long-term implications?"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={isRunning}
        rows={4}
      />

      {isOverLimit && (
        <p className="mt-1.5 text-xs text-red-400">
          Template exceeds 280 characters — trim before starting.
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between">
        <button
          type="button"
          className="btn-icon gap-1.5 text-xs px-2 py-1 text-muted-foreground"
          style={{ fontSize: '0.75rem' }}
          onClick={() => setShowExamples(p => !p)}
        >
          <Hash size={12} />
          {showExamples ? 'Hide examples' : 'Show examples'}
        </button>
        {value.trim() && (
          <button
            type="button"
            className="btn-icon gap-1 text-xs"
            style={{ fontSize: '0.75rem' }}
            onClick={() => onChange('')}
            disabled={isRunning}
          >
            <RotateCcw size={11} />
            Clear
          </button>
        )}
      </div>

      {showExamples && (
        <div className="mt-2 space-y-1.5">
          {EXAMPLE_TEMPLATES.map((tpl, i) => (
            <button
              key={`tpl-example-${i}`}
              type="button"
              className="w-full text-left text-xs px-2.5 py-2 rounded transition-colors"
              style={{ backgroundColor: 'var(--input)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.color = 'var(--foreground)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--muted-foreground)'; }}
              onClick={() => { onChange(tpl); setShowExamples(false); }}
              disabled={isRunning}
            >
              {tpl}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}