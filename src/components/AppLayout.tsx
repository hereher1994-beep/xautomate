import React from 'react';
import Topbar from '@/components/Topbar';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Topbar />
      <main className="pt-14">
        {children}
      </main>
    </div>
  );
}