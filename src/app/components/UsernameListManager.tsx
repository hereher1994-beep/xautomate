'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Users, Plus, Trash2, Upload, ClipboardPaste, X, Search, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { LogEntry } from '../types/automation';

interface UsernameListManagerProps {
  usernames: string[];
  onChange: (usernames: string[]) => void;
  isRunning: boolean;
  onLog: (level: LogEntry['level'], message: string) => void;
}

function sanitizeUsername(raw: string): string {
  return raw.replace(/^@/, '').replace(/https?:\/\/(www\.)?x\.com\//, '').replace(/https?:\/\/(www\.)?twitter\.com\//, '').trim();
}

function parseUsernames(raw: string): string[] {
  return raw
    .split(/[\n,\s;]+/)
    .map(s => sanitizeUsername(s))
    .filter(s => s.length > 0 && s.length <= 50 && /^[a-zA-Z0-9_]+$/.test(s));
}

export default function UsernameListManager({
  usernames,
  onChange,
  isRunning,
  onLog,
}: UsernameListManagerProps) {
  const [singleInput, setSingleInput] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [search, setSearch] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = search.trim()
    ? usernames.filter(u => u.toLowerCase().includes(search.toLowerCase()))
    : usernames;

  const handleAddSingle = useCallback(() => {
    const clean = sanitizeUsername(singleInput);
    if (!clean) return;
    if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
      toast.error('Invalid username', { description: 'Only letters, numbers, and underscores allowed.' });
      return;
    }
    if (usernames.includes(clean)) {
      toast.warning(`@${clean} is already in the list.`);
      return;
    }
    onChange([...usernames, clean]);
    setSingleInput('');
    onLog('info', `Added target: @${clean}`);
  }, [singleInput, usernames, onChange, onLog]);

  const handleAddSingleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAddSingle();
  };

  const handleRemove = useCallback((username: string) => {
    onChange(usernames.filter(u => u !== username));
    onLog('info', `Removed target: @${username}`);
  }, [usernames, onChange, onLog]);

  const handleBulkAdd = useCallback(() => {
    const parsed = parseUsernames(bulkText);
    const deduped = parsed.filter(u => !usernames.includes(u));
    if (deduped.length === 0) {
      toast.warning('No new usernames found in the pasted text.');
      return;
    }
    onChange([...usernames, ...deduped]);
    onLog('success', `Bulk added ${deduped.length} username(s). ${parsed.length - deduped.length} duplicate(s) skipped.`);
    toast.success(`Added ${deduped.length} username${deduped.length !== 1 ? 's' : ''}`, {
      description: `${parsed.length - deduped.length} duplicate(s) skipped.`,
    });
    setBulkText('');
    setShowBulk(false);
  }, [bulkText, usernames, onChange, onLog]);

  const handleFileUpload = useCallback((file: File) => {
    if (!file.name.match(/\.(txt|csv)$/i)) {
      toast.error('Unsupported file type', { description: 'Upload a .txt or .csv file.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseUsernames(text);
      const deduped = parsed.filter(u => !usernames.includes(u));
      onChange([...usernames, ...deduped]);
      onLog('success', `Imported ${deduped.length} username(s) from ${file.name}.`);
      toast.success(`Imported ${deduped.length} username${deduped.length !== 1 ? 's' : ''} from ${file.name}`);
    };
    reader.readAsText(file);
  }, [usernames, onChange, onLog]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleClearAll = () => {
    onChange([]);
    onLog('warn', 'All targets cleared.');
    toast.info('Target list cleared.');
  };

  return (
    <div className="config-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users size={15} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Target Usernames</span>
          <span className="font-mono-data text-xs px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(0,212,170,0.08)', color: 'var(--primary)', border: '1px solid rgba(0,212,170,0.15)' }}>
            {usernames.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="btn-secondary text-xs py-1 px-2 gap-1"
            onClick={() => setShowBulk(p => !p)}
            disabled={isRunning}
          >
            <ClipboardPaste size={12} />
            Bulk Paste
          </button>
          <button
            type="button"
            className="btn-secondary text-xs py-1 px-2 gap-1"
            onClick={() => fileRef.current?.click()}
            disabled={isRunning}
          >
            <Upload size={12} />
            Import File
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv"
            className="hidden"
            onChange={handleFilePick}
          />
        </div>
      </div>

      {/* Single add */}
      <label className="config-label">Add Username</label>
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium select-none">@</span>
          <input
            type="text"
            className="config-input pl-6 font-mono-data text-sm"
            placeholder="username"
            value={singleInput}
            onChange={e => setSingleInput(e.target.value)}
            onKeyDown={handleAddSingleKeyDown}
            disabled={isRunning}
            spellCheck={false}
          />
        </div>
        <button
          type="button"
          className="btn-primary py-1.5 px-3 gap-1 text-xs"
          onClick={handleAddSingle}
          disabled={!singleInput.trim() || isRunning}
        >
          <Plus size={13} />
          Add
        </button>
      </div>

      {/* Bulk paste panel */}
      {showBulk && (
        <div className="mb-3 p-3 rounded border"
          style={{ backgroundColor: 'var(--input)', borderColor: 'var(--border)' }}>
          <label className="config-label">Bulk Paste</label>
          <p className="text-xs text-muted-foreground mb-2">
            Paste usernames separated by newlines, commas, or spaces. <span className="font-mono-data">@</span> prefix and Twitter/X URLs are stripped automatically.
          </p>
          <textarea
            className="config-textarea min-h-[80px] text-xs"
            placeholder="@user1&#10;@user2&#10;user3, user4&#10;https://x.com/user5"
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            rows={4}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono-data">
              {bulkText.trim() ? `~${parseUsernames(bulkText).length} parsed` : 'paste usernames above'}
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary text-xs py-1 px-2.5" onClick={() => { setBulkText(''); setShowBulk(false); }}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary text-xs py-1 px-2.5"
                onClick={handleBulkAdd}
                disabled={!bulkText.trim()}
              >
                Add {bulkText.trim() ? parseUsernames(bulkText).length : 0} Usernames
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File drop zone */}
      <div
        className={`mb-3 border-2 border-dashed rounded p-3 text-center transition-colors cursor-pointer ${dragOver ? 'drag-active' : ''}`}
        style={{ borderColor: dragOver ? 'var(--primary)' : 'var(--border)', backgroundColor: dragOver ? 'rgba(0,212,170,0.04)' : 'transparent' }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={14} className="mx-auto mb-1 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Drop a <span className="font-mono-data">.txt</span> or <span className="font-mono-data">.csv</span> file here, or click to browse
        </p>
      </div>

      {/* Search + list */}
      {usernames.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                className="config-input pl-7 text-xs py-1.5"
                placeholder="Filter usernames…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn-danger text-xs py-1.5 px-2.5"
              onClick={handleClearAll}
              disabled={isRunning}
            >
              <Trash2 size={11} />
              Clear All
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto scrollbar-thin space-y-1 pr-0.5">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No usernames match your filter.</p>
            ) : (
              filtered.map((username) => (
                <div
                  key={`username-${username}`}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded group transition-colors"
                  style={{ backgroundColor: 'var(--input)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: 'rgba(0,212,170,0.1)', color: 'var(--primary)' }}>
                      {username[0]?.toUpperCase()}
                    </div>
                    <span className="font-mono-data text-xs text-foreground">@{username}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-icon opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    onClick={() => handleRemove(username)}
                    disabled={isRunning}
                    aria-label={`Remove @${username}`}
                  >
                    <X size={12} className="text-red-400" />
                  </button>
                </div>
              ))
            )}
          </div>

          {search && filtered.length !== usernames.length && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Showing {filtered.length} of {usernames.length} usernames
            </p>
          )}
        </>
      )}

      {usernames.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <AlertCircle size={20} className="text-muted-foreground mb-2" />
          <p className="text-sm font-medium text-foreground mb-1">No target usernames</p>
          <p className="text-xs text-muted-foreground">
            Add usernames above or import a .txt file to build your target list.
          </p>
        </div>
      )}
    </div>
  );
}