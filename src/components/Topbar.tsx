import React from 'react';
import AppLogo from '@/components/ui/AppLogo';
import Link from 'next/link';
import { Server } from 'lucide-react';

export default function Topbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6 border-b border-border"
      style={{ backgroundColor: 'rgba(10, 10, 15, 0.92)', backdropFilter: 'blur(12px)' }}>
      <div className="flex items-center gap-2.5">
        <AppLogo size={28} />
        <span className="font-semibold text-base tracking-tight text-foreground">
          XAutomate
        </span>
        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-mono-data font-medium"
          style={{ backgroundColor: 'rgba(0,212,170,0.1)', color: 'var(--primary)', border: '1px solid rgba(0,212,170,0.2)' }}>
          v0.1-exp
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/deploy"
          className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded transition-all"
          style={{ color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
        >
          <Server size={12} />
          Deploy to VPS
        </Link>
        <span className="text-xs text-muted-foreground font-mono-data hidden md:block">
          Solo Experiment Mode
        </span>
        <div className="w-px h-4 bg-border hidden md:block" />
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
          <span className="text-xs text-muted-foreground">personal</span>
        </div>
      </div>
    </header>
  );
}