'use client';

import React, { useState, useEffect } from 'react';
import { Activity, Clock, Users, ImageIcon, Timer, Zap } from 'lucide-react';
import type { AutomationStatus } from '../types/automation';

interface StatusBarProps {
  status: AutomationStatus;
  cycleCount: number;
  lastCycleTime: string | null;
  targetCount: number;
  imageCount: number;
  nextCycleIn: number | null;
  intervalMinutes: number;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const STATUS_CONFIG: Record<AutomationStatus, { label: string; dotClass: string; badgeClass: string }> = {
  idle: { label: 'Idle', dotClass: 'bg-muted-foreground', badgeClass: 'status-badge-idle' },
  configured: { label: 'Configured', dotClass: 'bg-blue-400', badgeClass: 'status-badge-configured' },
  running: { label: 'Running', dotClass: 'bg-primary status-pulse-running', badgeClass: 'status-badge-running' },
  paused: { label: 'Paused', dotClass: 'bg-accent', badgeClass: 'status-badge-paused' },
  error: { label: 'Error', dotClass: 'bg-red-500 status-pulse-error', badgeClass: 'status-badge-error' },
};

export default function StatusBar({
  status,
  cycleCount,
  lastCycleTime,
  targetCount,
  imageCount,
  nextCycleIn,
  intervalMinutes,
}: StatusBarProps) {
  const cfg = STATUS_CONFIG[status];

  return (
    <div className="config-card flex flex-wrap items-center gap-4 xl:gap-6">
      {/* Status badge */}
      <div className="flex items-center gap-2.5 min-w-[110px]">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dotClass}`} />
        <span className={`status-badge ${cfg.badgeClass}`}>{cfg.label}</span>
      </div>

      <div className="w-px h-6 bg-border hidden sm:block" />

      {/* Cycle count */}
      <div className="flex items-center gap-2">
        <Zap size={14} className="text-primary flex-shrink-0" />
        <div>
          <span className="text-xs text-muted-foreground block leading-none mb-0.5">Cycles Run</span>
          <span className="font-mono-data text-sm font-semibold text-foreground">{cycleCount}</span>
        </div>
      </div>

      <div className="w-px h-6 bg-border hidden sm:block" />

      {/* Last cycle */}
      <div className="flex items-center gap-2">
        <Clock size={14} className="text-muted-foreground flex-shrink-0" />
        <div>
          <span className="text-xs text-muted-foreground block leading-none mb-0.5">Last Cycle</span>
          <span className="font-mono-data text-xs font-medium text-foreground">
            {lastCycleTime ?? '—'}
          </span>
        </div>
      </div>

      <div className="w-px h-6 bg-border hidden sm:block" />

      {/* Targets */}
      <div className="flex items-center gap-2">
        <Users size={14} className="text-muted-foreground flex-shrink-0" />
        <div>
          <span className="text-xs text-muted-foreground block leading-none mb-0.5">Targets</span>
          <span className="font-mono-data text-sm font-semibold text-foreground">{targetCount}</span>
        </div>
      </div>

      <div className="w-px h-6 bg-border hidden sm:block" />

      {/* Images */}
      <div className="flex items-center gap-2">
        <ImageIcon size={14} className="text-muted-foreground flex-shrink-0" />
        <div>
          <span className="text-xs text-muted-foreground block leading-none mb-0.5">Images</span>
          <span className="font-mono-data text-sm font-semibold text-foreground">{imageCount}</span>
        </div>
      </div>

      <div className="w-px h-6 bg-border hidden sm:block" />

      {/* Next cycle countdown */}
      <div className="flex items-center gap-2">
        <Timer size={14} className={nextCycleIn !== null ? 'text-primary' : 'text-muted-foreground'} />
        <div>
          <span className="text-xs text-muted-foreground block leading-none mb-0.5">Next Cycle</span>
          <span className={`font-mono-data text-sm font-semibold ${nextCycleIn !== null ? 'text-primary' : 'text-muted-foreground'}`}>
            {nextCycleIn !== null ? formatCountdown(nextCycleIn) : `${intervalMinutes}m 00s`}
          </span>
        </div>
      </div>

      {/* Activity indicator */}
      {status === 'running' && (
        <div className="ml-auto flex items-center gap-1.5">
          <Activity size={14} className="text-primary" />
          <span className="text-xs text-primary font-medium">Live</span>
        </div>
      )}
    </div>
  );
}