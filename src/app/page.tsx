import React from 'react';
import AppLayout from '@/components/AppLayout';
import AutomationControlPanel from '@/app/components/AutomationControlPanel';

export default function HomePage() {
  return (
    <AppLayout>
      <AutomationControlPanel />
    </AppLayout>
  );
}