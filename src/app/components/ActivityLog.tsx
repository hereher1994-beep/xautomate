'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Terminal, Trash2, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import type { LogEntry } from '../types/automation';

interface ActivityLogProps {
  logs: LogEntry[];
  onClear: () => void;
}

const LEVEL_STYLES: Record<LogEntry['level'], { prefix: string; color: string; bg: string }> = {
  info: { prefix: 'INFO ', color: 'var(--muted-foreground)', bg: 'transparent' },
  success: { prefix: 'OK   ', color: 'var(--primary)', bg: 'rgba(0,212,170,0.04)' },
  warn: { prefix: 'WARN ', color: 'var(--accent)', bg: 'rgba(245,158,11,0.04)' },
  error: { prefix: 'ERR  ', color: '#ef4444', bg: 'rgba(239,68,68,0.04)' },
};

export default function ActivityLog({ logs, onClear }: ActivityLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<LogEntry['level'] | 'all'>('all');

  const filtered = filter === 'all' ? logs : logs.filter(l => l.level === filter);

  useEffect(() => {
    if (autoScroll && !collapsed) {
      // Scroll to top (newest entries are at top)
    }
  }, [logs, autoScroll, collapsed]);

  const handleCopyLogs = async () => {
    const text = logs.map(l => `[${l.timestamp}] ${LEVEL_STYLES[l.level].prefix}${l.message}`).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`Copied ${logs.length} log entries`);
    setTimeout(() => setCopied(false), 2000);
  };

  const FILTER_OPTIONS: Array<{ value: LogEntry['level'] | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'info', label: 'Info' },
    { value: 'success', label: 'OK' },
    { value: 'warn', label: 'Warn' },
    { value: 'error', label: 'Error' },
  ];

  return (
    <div className="config-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Terminal size={15} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Activity Log</span>
          <span className="font-mono-data text-xs px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(107,107,136,0.1)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}>
            {logs.length} entries
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Filter pills */}
          <div className="hidden sm:flex items-center gap-1">
            {FILTER_OPTIONS.map(opt => (
              <button
                key={`log-filter-${opt.value}`}
                type="button"
                className="font-mono-data text-xs px-2 py-0.5 rounded transition-all"
                style={{
                  backgroundColor: filter === opt.value ? 'var(--secondary)' : 'transparent',
                  color: filter === opt.value ? 'var(--foreground)' : 'var(--muted-foreground)',
                  border: `1px solid ${filter === opt.value ? 'var(--border)' : 'transparent'}`,
                }}
                onClick={() => setFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-border" />

          <button
            type="button"
            className="btn-icon"
            onClick={handleCopyLogs}
            disabled={logs.length === 0}
            aria-label="Copy log to clipboard"
          >
            {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={onClear}
            disabled={logs.length === 0}
            aria-label="Clear activity log"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={() => setCollapsed(p => !p)}
            aria-label={collapsed ? 'Expand log' : 'Collapse log'}
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div
          ref={containerRef}
          className="rounded overflow-y-auto scrollbar-thin"
          style={{
            backgroundColor: 'var(--input)',
            border: '1px solid var(--border)',
            height: '220px',
            fontFamily: 'var(--font-mono)',
          }}
          onScroll={e => {
            const el = e.currentTarget;
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
            setAutoScroll(atBottom);
          }}
        >
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs text-muted-foreground">No log entries{filter !== 'all' ? ` for filter "${filter}"` : ''}.</p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {filtered.map(entry => {
                const style = LEVEL_STYLES[entry.level];
                const isRetry = entry.message.startsWith('🔄 Retry') || entry.message.startsWith('⚠ Tweet attempt');
                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2 px-2 py-1 rounded log-fade-in"
                    style={{
                      backgroundColor: isRetry ? 'rgba(245,158,11,0.08)' : style.bg,
                      borderLeft: isRetry ? '2px solid rgba(245,158,11,0.5)' : '2px solid transparent',
                    }}
                  >
                    <span className="font-mono-data text-xs flex-shrink-0"
                      style={{ color: 'var(--muted-foreground)', minWidth: '140px' }}>
                      {entry.timestamp}
                    </span>
                    <span className="font-mono-data text-xs font-semibold flex-shrink-0"
                      style={{ color: style.color, minWidth: '48px' }}>
                      {isRetry ? 'RETRY' : style.prefix}
                    </span>
                    <span className="font-mono-data text-xs break-all"
                      style={{ color: entry.level === 'info' ? 'var(--foreground)' : style.color }}>
                      {entry.message}
                    </span>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      )}

      {!collapsed && (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-mono-data">
            {filtered.length} of {logs.length} entries shown
          </p>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="w-3 h-3 accent-primary"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
            />
            <span className="text-xs text-muted-foreground">Auto-scroll</span>
          </label>
        </div>
      )}
    </div>
  );
}