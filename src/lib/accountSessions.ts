'use client';

/**
 * Multi-account X session storage.
 * Each account stores its username, password, and extracted session cookies.
 * Sessions persist in localStorage so every logged-in account stays logged in.
 */

export interface AccountSession {
  accountId: string;
  username: string;
  password: string;
  /** Serialized cookie JSON array from the browser login */
  cookieJson: string;
  /** The auth_token value extracted from cookies */
  authToken: string;
  /** The ct0 (CSRF token) value extracted from cookies */
  ct0: string;
  proxy: string;
  loggedInAt: number;
  /** Display name shown in UI */
  displayName?: string;
}

const LS_KEY = 'xautomate_account_sessions_v2';

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
