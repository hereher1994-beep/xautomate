'use client';

/**
 * Multi-account Twitter session storage.
 * Each account (by accountId) stores its own OAuth access token + Twitter user info.
 * Sessions persist in localStorage so every logged-in account stays logged in.
 */

export interface AccountSession {
  accountId: string;
  accessToken: string;
  twitterUserId: string;
  twitterName: string;
  twitterImage: string;
  proxy: string;
  loggedInAt: number;
}

const LS_KEY = 'xautomate_account_sessions';

export function loadAllSessions(): AccountSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as AccountSession[];
  } catch { /* ignore */ }
  return [];
}

export function saveSession(session: AccountSession): void {
  if (typeof window === 'undefined') return;
  const all = loadAllSessions();
  const idx = all.findIndex(s => s.accountId === session.accountId);
  if (idx !== -1) {
    all[idx] = session;
  } else {
    all.push(session);
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch { /* quota */ }
}

export function getSessionForAccount(accountId: string): AccountSession | null {
  const all = loadAllSessions();
  return all.find(s => s.accountId === accountId) ?? null;
}

export function removeSession(accountId: string): void {
  if (typeof window === 'undefined') return;
  const all = loadAllSessions().filter(s => s.accountId !== accountId);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch { /* quota */ }
}

export function clearAllSessions(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LS_KEY);
  } catch { /* ignore */ }
}
