'use client';

import React, { useState } from 'react';
import { Timer, Play, Square, Pause, RotateCcw, ChevronUp, ChevronDown, AlertTriangle, FlaskConical } from 'lucide-react';
import type { AutomationStatus } from '../types/automation';

interface CycleControlCardProps {
  intervalMinutes: number;
  onIntervalChange: (v: number) => void;
  usernamesPerTweet: number;
  onUsernamesPerTweetChange: (v: number) => void;
  totalUsernames: number;
  status: AutomationStatus;
  isStarting: boolean;
  isTesting?: boolean;
  cycleCount: number;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onTestTweet: () => void;
}

const PRESET_USERNAMES_PER_TWEET = [4, 8, 12, 16];

export default function CycleControlCard({
  usernamesPerTweet,
  onUsernamesPerTweetChange,
  totalUsernames,
  status,
  isStarting,
  isTesting = false,
  cycleCount,
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

  const incrementUpt = () => onUsernamesPerTweetChange(Math.min(usernamesPerTweet + 1, Math.max(totalUsernames, 1)));
  const decrementUpt = () => onUsernamesPerTweetChange(Math.max(usernamesPerTweet - 1, 1));

  const handleUptInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v) && v >= 1) onUsernamesPerTweetChange(v);
  };

  return (
    <div className="config-card">
      <div className="flex items-center gap-2 mb-4">
        <Timer size={15} className="text-primary" />
        <span className="text-sm font-semibold text-foreground">Cycle Control</span>
      </div>

      {/* Usernames per tweet */}
      <label className="config-label">Usernames Tagged per Tweet</label>
      <p className="text-xs text-muted-foreground mb-2">
        Bot randomly picks this many usernames from your list and appends them at the end of each tweet.
      </p>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center rounded overflow-hidden"
          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--input)' }}>
          <button
            type="button"
            className="px-2.5 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            onClick={decrementUpt}
            disabled={usernamesPerTweet <= 1 || isActive}
            aria-label="Decrease usernames per tweet"
          >
            <ChevronDown size={14} />
          </button>
          <input
            type="number"
            className="font-mono-data text-sm font-semibold text-center bg-transparent text-foreground outline-none"
            style={{ width: '48px', border: 'none' }}
            value={usernamesPerTweet}
            onChange={handleUptInput}
            min={1}
            disabled={isActive}
          />
          <button
            type="button"
            className="px-2.5 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            onClick={incrementUpt}
            disabled={isActive}
            aria-label="Increase usernames per tweet"
          >
            <ChevronUp size={14} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_USERNAMES_PER_TWEET.map(p => (
            <button
              key={`upt-${p}`}
              type="button"
              className="font-mono-data text-xs px-2 py-1 rounded transition-all"
              style={{
                backgroundColor: usernamesPerTweet === p ? 'var(--primary)' : 'var(--input)',
                color: usernamesPerTweet === p ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                border: `1px solid ${usernamesPerTweet === p ? 'var(--primary)' : 'var(--border)'}`,
              }}
              onClick={() => !isActive && onUsernamesPerTweetChange(p)}
              disabled={isActive}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      {totalUsernames > 0 && usernamesPerTweet > totalUsernames && (
        <div className="mb-3 flex items-start gap-1.5 p-2 rounded"
          style={{ backgroundColor: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <AlertTriangle size={12} className="text-accent mt-0.5 flex-shrink-0" />
          <p className="text-xs" style={{ color: 'var(--accent)' }}>
            You only have {totalUsernames} username{totalUsernames !== 1 ? 's' : ''} — bot will tag all of them per tweet.
          </p>
        </div>
      )}

      {/* Cycle stats */}
      <div className="mb-4">
        <div className="rounded p-2.5"
          style={{ backgroundColor: 'var(--input)', border: '1px solid var(--border)' }}>
          <span className="config-label mb-0.5">Cycles Completed</span>
          <span className="font-mono-data text-lg font-bold text-foreground">{cycleCount}</span>
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
              className="btn-secondary justify-center py-2.5 text-sm gap-2"
              style={{ minWidth: '120px' }}
              onClick={onTestTweet}
              disabled={isStarting || isTesting}
              title="Fire one tweet immediately to validate your full configuration"
            >
              {isTesting ? (
                <>
                  <RotateCcw size={15} className="animate-spin" />
                  Testing…
                </>
              ) : (
                <>
                  <FlaskConical size={15} />
                  Test Tweet
                </>
              )}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn-secondary flex-1 justify-center py-2.5 text-sm gap-2"
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
              className="flex-1 justify-center py-2.5 text-sm gap-2 rounded font-medium transition-all flex items-center"
              style={{
                backgroundColor: confirmStop ? 'rgba(239,68,68,0.15)' : 'transparent',
                color: confirmStop ? '#ef4444' : '#ef4444',
                border: `1px solid ${confirmStop ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.3)'}`,
              }}
              onClick={handleStopClick}
            >
              <Square size={15} />
              {confirmStop ? 'Confirm Stop' : 'Stop'}
            </button>
          </>
        )}
      </div>

      {confirmStop && (
        <p className="mt-2 text-xs text-red-400 text-center">
          Click Stop again to confirm. This will end the current session.
        </p>
      )}
    </div>
  );
}