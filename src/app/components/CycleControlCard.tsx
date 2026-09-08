'use client';

import React, { useState } from 'react';
import { Timer, Play, Square, Pause, RotateCcw, FlaskConical, Info } from 'lucide-react';
import type { AutomationStatus } from '../types/automation';

interface CycleControlCardProps {
  totalUsernames: number;
  status: AutomationStatus;
  isStarting: boolean;
  isTesting?: boolean;
  cycleCount: number;
  tweetsPosted: number;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onTestTweet: () => void;
}

export default function CycleControlCard({
  totalUsernames,
  status,
  isStarting,
  isTesting = false,
  cycleCount,
  tweetsPosted,
  onStart,
  onStop,
  onPause,
  onTestTweet,
}: CycleControlCardProps) {
  const [confirmStop, setConfirmStop] = useState(false);

  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isActive = isRunning || isPaused;

  const handleStopClick = () => {
    if (!confirmStop) {
      setConfirmStop(true);
      setTimeout(() => setConfirmStop(false), 4000);
      return;
    }
    setConfirmStop(false);
    onStop();
  };

  return (
    <div className="config-card">
      <div className="flex items-center gap-2 mb-4">
        <Timer size={15} className="text-primary" />
        <span className="text-sm font-semibold text-foreground">Cycle Control</span>
      </div>

      {/* Cycle pattern info */}
      <div className="mb-4 rounded-lg p-3" style={{ backgroundColor: 'var(--input)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-1.5 mb-2">
          <Info size={12} className="text-primary flex-shrink-0" />
          <span className="text-xs font-semibold text-foreground">Automated Cycle Pattern</span>
        </div>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="font-mono-data text-primary font-bold mt-0.5">①</span>
            <span><strong className="text-foreground">10 posts</strong> — random 1–3 min gaps · context + random 3–6 usernames + random image</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono-data text-primary font-bold mt-0.5">②</span>
            <span><strong className="text-foreground">3 photo-only posts</strong> — image only, no text, no usernames (anti-spam buffer)</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono-data text-accent font-bold mt-0.5">③</span>
            <span><strong className="text-foreground">Rest 3 minutes</strong></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono-data text-primary font-bold mt-0.5">④</span>
            <span><strong className="text-foreground">20 posts</strong> — random 1–3 min gaps · context + random 3–6 usernames + random image</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono-data text-accent font-bold mt-0.5">⑤</span>
            <span><strong className="text-foreground">Rest 10 minutes</strong> → repeat from ①</span>
          </div>
          <div className="flex items-start gap-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="font-mono-data text-emerald-400 font-bold mt-0.5">★</span>
            <span>Runs until <strong className="text-foreground">entire username list is exhausted</strong> · 3–6 random usernames per tweet</span>
          </div>
        </div>
      </div>

      {/* Cycle stats */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded p-2.5" style={{ backgroundColor: 'var(--input)', border: '1px solid var(--border)' }}>
          <span className="config-label mb-0.5">Full Cycles Done</span>
          <span className="font-mono-data text-lg font-bold text-foreground">{cycleCount}</span>
        </div>
        <div className="rounded p-2.5" style={{ backgroundColor: 'var(--input)', border: '1px solid var(--border)' }}>
          <span className="config-label mb-0.5">Tweets Posted</span>
          <span className="font-mono-data text-lg font-bold text-foreground">{tweetsPosted}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {!isActive ? (
          <>
            <button
              type="button"
              className="btn-primary flex-1 justify-center py-2.5 text-sm"
              onClick={onStart}
              disabled={isStarting || isTesting}
            >
              {isStarting ? (
                <>
                  <RotateCcw size={15} className="animate-spin" />
                  Validating config…
                </>
              ) : (
                <>
                  <Play size={15} />
                  Start Automation
                </>
              )}
            </button>
            <button
              type="button"
              className="btn-secondary px-3 py-2.5 text-sm"
              onClick={onTestTweet}
              disabled={isStarting || isTesting}
              title="Send one test tweet immediately"
            >
              {isTesting ? (
                <RotateCcw size={15} className="animate-spin" />
              ) : (
                <FlaskConical size={15} />
              )}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn-secondary flex-1 justify-center py-2.5 text-sm"
              onClick={onPause}
            >
              {isPaused ? (
                <>
                  <Play size={15} />
                  Resume
                </>
              ) : (
                <>
                  <Pause size={15} />
                  Pause
                </>
              )}
            </button>
            <button
              type="button"
              className="flex-1 justify-center py-2.5 text-sm flex items-center gap-1.5 rounded font-medium transition-all"
              style={{
                backgroundColor: confirmStop ? 'rgba(239,68,68,0.15)' : 'var(--input)',
                color: confirmStop ? '#ef4444' : 'var(--muted-foreground)',
                border: `1px solid ${confirmStop ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
              }}
              onClick={handleStopClick}
            >
              <Square size={15} />
              {confirmStop ? 'Confirm Stop' : 'Stop'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}