'use client';

export interface XAccount {
  id: string;
  name: string;
  cookies: string;
  proxy: string;
  context: string;
  usernames: string[];
  images: { id: string; name: string; url: string; size: number }[];
  openRouterKey: string;
  status: 'idle' | 'running' | 'paused' | 'error' | 'done';
  cycleCount: number;
  tweetsPosted: number;
  lastCycleTime: string | null;
  createdAt: number;
  // Cycle phase tracking (persisted)
  cyclePhase: 'A' | 'B' | 'rest_B' | 'C' | 'rest_C';
  phasePostCount: number;
  // Supabase config id (set after server-side sync)
  supabaseConfigId?: string;
}

export function createDefaultAccount(name?: string): XAccount {
  return {
    id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name ?? `Account ${new Date().toLocaleTimeString()}`,
    cookies: '',
    proxy: '',
    context: '',
    usernames: ['elonmusk', 'sama', 'karpathy', 'naval', 'paulg'],
    images: [],
    openRouterKey: '',
    status: 'idle',
    cycleCount: 0,
    tweetsPosted: 0,
    lastCycleTime: null,
    createdAt: Date.now(),
    cyclePhase: 'A',
    phasePostCount: 0,
  };
}
