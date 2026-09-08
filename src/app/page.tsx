'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import AutomationControlPanel from '@/app/components/AutomationControlPanel';
import MultiAccountPanel from '@/app/components/MultiAccountPanel';
import { User, Users } from 'lucide-react';

export default function HomePage() {
  const [tab, setTab] = useState<'single' | 'multi'>('single');

  return (
    <AppLayout>
      {/* Tab switcher */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 pt-5">
        <div className="flex items-center gap-1 p-1 rounded-lg w-fit"
          style={{ backgroundColor: 'var(--input)', border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setTab('single')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === 'single' ?'bg-primary text-black shadow-sm' :'text-muted-foreground hover:text-foreground'
            }`}
          >
            <User size={14} />
            Single Account
          </button>
          <button
            type="button"
            onClick={() => setTab('multi')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === 'multi' ?'bg-primary text-black shadow-sm' :'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users size={14} />
            Multi-Account
          </button>
        </div>
      </div>

      {tab === 'single' ? <AutomationControlPanel /> : <MultiAccountPanel />}
    </AppLayout>
  );
}