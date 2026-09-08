'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Trash2, Edit2, Check, X, ArrowRight, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import {
  AccountConfig,
  createDefaultAccount,
  loadAccountsFromStorage,
  saveAccountsToStorage,
  loadActiveAccountId,
  saveActiveAccountId,
} from '@/app/types/automation';
import { toast } from 'sonner';
import { Toaster } from 'sonner';

export default function AccountsDashboard() {
  const [accounts, setAccounts] = useState<AccountConfig[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = loadAccountsFromStorage();
    if (stored.length > 0) {
      setAccounts(stored);
    } else {
      const defaultAcc = createDefaultAccount('acc-1', 'Account 1');
      setAccounts([defaultAcc]);
      saveAccountsToStorage([defaultAcc]);
    }
    setActiveId(loadActiveAccountId());
  }, []);

  const persistAccounts = useCallback((updated: AccountConfig[]) => {
    setAccounts(updated);
    saveAccountsToStorage(updated);
  }, []);

  const handleAddAccount = () => {
    const id = `acc-${Date.now()}`;
    const name = `Account ${accounts.length + 1}`;
    const newAcc = createDefaultAccount(id, name);
    persistAccounts([...accounts, newAcc]);
    toast.success(`Added ${name}`);
  };

  const handleDeleteAccount = (id: string) => {
    if (accounts.length <= 1) {
      toast.error('Cannot delete the last account.');
      return;
    }
    const updated = accounts.filter(a => a.id !== id);
    persistAccounts(updated);
    if (activeId === id) {
      setActiveId(null);
      saveActiveAccountId(updated[0].id);
    }
    toast.info('Account deleted.');
  };

  const handleStartEdit = (acc: AccountConfig) => {
    setEditingId(acc.id);
    setEditName(acc.name);
  };

  const handleSaveName = (id: string) => {
    if (!editName.trim()) return;
    const updated = accounts.map(a => a.id === id ? { ...a, name: editName.trim() } : a);
    persistAccounts(updated);
    setEditingId(null);
  };

  const handleSetActive = (id: string) => {
    setActiveId(id);
    saveActiveAccountId(id);
  };

  if (!mounted) return null;

  return (
    <AppLayout>
      <Toaster position="bottom-right" theme="dark" toastOptions={{
        style: { background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' },
      }} />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Users size={20} className="text-primary" />
              Multi-Account Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Each account has its own cookies, proxy, context, usernames, images, and cycle settings.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary gap-2 py-2 px-4 text-sm"
            onClick={handleAddAccount}
          >
            <Plus size={15} />
            Add Account
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => {
            const isActive = activeId === acc.id;
            const hasCookies = acc.cookies.trim().length > 0;
            const hasContext = acc.context.trim().length > 0;
            const isEditing = editingId === acc.id;

            return (
              <div
                key={acc.id}
                className="rounded-lg p-4 flex flex-col gap-3 transition-all"
                style={{
                  backgroundColor: 'var(--card)',
                  border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                  boxShadow: isActive ? '0 0 0 1px var(--primary)' : 'none',
                }}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          className="config-input text-sm py-1 px-2 flex-1"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveName(acc.id); if (e.key === 'Escape') setEditingId(null); }}
                          autoFocus
                        />
                        <button type="button" className="btn-icon" onClick={() => handleSaveName(acc.id)}>
                          <Check size={13} className="text-primary" />
                        </button>
                        <button type="button" className="btn-icon" onClick={() => setEditingId(null)}>
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-foreground truncate">{acc.name}</span>
                        <button type="button" className="btn-icon opacity-50 hover:opacity-100" onClick={() => handleStartEdit(acc)}>
                          <Edit2 size={11} />
                        </button>
                      </div>
                    )}
                    <span className="font-mono-data text-xs text-muted-foreground">{acc.id}</span>
                  </div>
                  {isActive && (
                    <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{ backgroundColor: 'rgba(0,212,170,0.12)', color: 'var(--primary)', border: '1px solid rgba(0,212,170,0.25)' }}>
                      Active
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Usernames', value: acc.usernames.length },
                    { label: 'Images', value: acc.images.length },
                    { label: 'Interval', value: `${acc.intervalMinutes}m` },
                  ].map(stat => (
                    <div key={stat.label} className="rounded p-2 text-center"
                      style={{ backgroundColor: 'var(--input)', border: '1px solid var(--border)' }}>
                      <div className="font-mono-data text-sm font-bold text-foreground">{stat.value}</div>
                      <div className="text-xs text-muted-foreground">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Status indicators */}
                <div className="flex flex-wrap gap-1.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono-data ${hasCookies ? 'text-primary' : 'text-muted-foreground'}`}
                    style={{ backgroundColor: hasCookies ? 'rgba(0,212,170,0.08)' : 'var(--input)', border: `1px solid ${hasCookies ? 'rgba(0,212,170,0.2)' : 'var(--border)'}` }}>
                    {hasCookies ? '✓ cookies' : '✗ no cookies'}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono-data ${hasContext ? 'text-primary' : 'text-muted-foreground'}`}
                    style={{ backgroundColor: hasContext ? 'rgba(0,212,170,0.08)' : 'var(--input)', border: `1px solid ${hasContext ? 'rgba(0,212,170,0.2)' : 'var(--border)'}` }}>
                    {hasContext ? '✓ context' : '✗ no context'}
                  </span>
                  {acc.proxy && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-mono-data text-primary"
                      style={{ backgroundColor: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.2)' }}>
                      ✓ proxy
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-auto pt-1">
                  {!isActive && (
                    <button
                      type="button"
                      className="btn-secondary text-xs py-1.5 px-3 gap-1 flex-1 justify-center"
                      onClick={() => handleSetActive(acc.id)}
                    >
                      Set Active
                    </button>
                  )}
                  <Link
                    href={`/account/${acc.id}`}
                    className="btn-primary text-xs py-1.5 px-3 gap-1 flex-1 justify-center flex items-center"
                    onClick={() => handleSetActive(acc.id)}
                  >
                    Open
                    <ChevronRight size={13} />
                  </Link>
                  {accounts.length > 1 && (
                    <button
                      type="button"
                      className="btn-icon text-red-400 hover:text-red-300"
                      onClick={() => handleDeleteAccount(acc.id)}
                      title="Delete account"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add account card */}
          <button
            type="button"
            className="rounded-lg p-4 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer min-h-[200px]"
            style={{ border: '2px dashed var(--border)', backgroundColor: 'transparent' }}
            onClick={handleAddAccount}
          >
            <Plus size={24} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Add Account</span>
          </button>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-mono-data">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''} configured · All data stored locally
          </span>
          <Link href="/deploy" className="btn-secondary text-xs py-1.5 px-3 gap-1.5 flex items-center">
            <ArrowRight size={13} />
            Deploy to VPS
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
