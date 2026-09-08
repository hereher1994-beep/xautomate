'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import AutomationControlPanel from '@/app/components/AutomationControlPanel';
import {
  AccountConfig,
  loadAccountsFromStorage,
  saveAccountsToStorage,
  saveActiveAccountId,
} from '@/app/types/automation';

export default function AccountPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params?.id as string;
  const [account, setAccount] = useState<AccountConfig | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const accounts = loadAccountsFromStorage();
    const found = accounts.find(a => a.id === accountId);
    if (found) {
      setAccount(found);
      saveActiveAccountId(accountId);
    } else {
      setNotFound(true);
    }
  }, [accountId]);

  const handleAccountChange = (updated: AccountConfig) => {
    setAccount(updated);
    const accounts = loadAccountsFromStorage();
    const newAccounts = accounts.map(a => a.id === updated.id ? updated : a);
    saveAccountsToStorage(newAccounts);
  };

  if (notFound) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-muted-foreground">Account not found.</p>
          <button className="btn-primary" onClick={() => router.push('/accounts')}>
            Back to Dashboard
          </button>
        </div>
      </AppLayout>
    );
  }

  if (!account) return null;

  return (
    <AppLayout>
      <AutomationControlPanel
        account={account}
        onAccountChange={handleAccountChange}
      />
    </AppLayout>
  );
}
