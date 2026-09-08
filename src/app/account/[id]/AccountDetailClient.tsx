'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import AccountPage from '@/app/components/AccountPage';

import type { XAccount } from '@/app/types/account';
import { useRouter } from 'next/navigation';

const LS_ACCOUNTS = 'xautomate_accounts_v1';

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota */ }
}

interface AccountDetailClientProps {
  accountId: string;
}

export default function AccountDetailClient({ accountId }: AccountDetailClientProps) {
  const router = useRouter();
  const [account, setAccount] = useState<XAccount | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = lsGet<XAccount[]>(LS_ACCOUNTS, []);
    const found = saved.find(a => a.id === accountId);
    if (found) {
      setAccount({
        ...found,
        cyclePhase: found.cyclePhase ?? 'A',
        phasePostCount: found.phasePostCount ?? 0,
      });
    }
    setMounted(true);
  }, [accountId]);

  const handleUpdate = useCallback((id: string, patch: Partial<XAccount>) => {
    setAccount(prev => {
      if (!prev || prev.id !== id) return prev;
      const updated = { ...prev, ...patch };
      // Persist to localStorage
      const saved = lsGet<XAccount[]>(LS_ACCOUNTS, []);
      const newList = saved.map(a => a.id === id ? updated : a);
      lsSet(LS_ACCOUNTS, newList);
      return updated;
    });
  }, []);

  const handleRemove = useCallback((id: string) => {
    const saved = lsGet<XAccount[]>(LS_ACCOUNTS, []);
    lsSet(LS_ACCOUNTS, saved.filter(a => a.id !== id));
    toast.info('Account removed');
    router.push('/');
  }, [router]);

  const handleBack = useCallback(() => {
    router.push('/');
  }, [router]);

  if (!mounted) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Loading account…</div>
      </AppLayout>
    );
  }

  if (!account) {
    return (
      <AppLayout>
        <div className="max-w-screen-xl mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground mb-4">Account not found.</p>
          <button type="button" onClick={() => router.push('/')} className="btn-primary px-5 py-2 text-sm">
            Back to Dashboard
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{ style: { background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' } }}
      />
      <AccountPage
        account={account}
        onUpdate={handleUpdate}
        onRemove={handleRemove}
        onBack={handleBack}
      />
    </AppLayout>
  );
}
