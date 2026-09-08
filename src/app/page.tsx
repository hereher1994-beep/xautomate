'use client';

import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import AutomationControlPanel from '@/app/components/AutomationControlPanel';
import {
  AccountConfig,
  loadAccountsFromStorage,
  saveAccountsToStorage,
  createDefaultAccount,
  loadActiveAccountId,
} from '@/app/types/automation';

export default function HomePage() {
  const [account, setAccount] = useState<AccountConfig | null>(null);

  useEffect(() => {
    let accounts = loadAccountsFromStorage();
    if (accounts.length === 0) {
      const def = createDefaultAccount('acc-1', 'Account 1');
      accounts = [def];
      saveAccountsToStorage(accounts);
    }
    // Load the active account, or fall back to the first one
    const activeId = loadActiveAccountId();
    const active = accounts.find(a => a.id === activeId) ?? accounts[0];
    setAccount(active);
  }, []);

  const handleAccountChange = (updated: AccountConfig) => {
    setAccount(updated);
    let accounts = loadAccountsFromStorage();
    const newAccounts = accounts.map(a => a.id === updated.id ? updated : a);
    saveAccountsToStorage(newAccounts);
  };

  if (!account) return null;

  return (
    <AppLayout>
      <AutomationControlPanel account={account} onAccountChange={handleAccountChange} />
    </AppLayout>
  );
}