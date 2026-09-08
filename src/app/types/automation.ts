export type AutomationStatus = 'idle' | 'configured' | 'running' | 'paused' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export interface ImageAttachment {
  id: string;
  name: string;
  url: string;
  size: number;
}

export interface AccountConfig {
  id: string;
  name: string;
  proxy: string;
  cookies: string;
  context: string;
  usernames: string[];
  images: ImageAttachment[];
  intervalMinutes: number;
  usernamesPerTweet: number;
}

export interface ParsedCookies {
  /** Key-value map of all parsed cookie pairs */
  pairs: Record<string, string>;
  /** Ready-to-use Cookie header string: "name=value; name2=value2; ..." */
  headerString: string;
  /** Number of parsed cookie pairs */
  count: number;
  /** Whether the critical auth fields are present */
  hasAuthToken: boolean;
  hasCt0: boolean;
  hasTwid: boolean;
}

/**
 * Parses a Cookie-Editor JSON export (array of cookie objects) into structured cookie data.
 * Each object must have at least a "name" and "value" field.
 * Example: [{"name":"auth_token","value":"abc123",...}, ...]
 */
export function parseCookieJson(raw: string): ParsedCookies {
  const pairs: Record<string, string> = {};

  if (!raw || !raw.trim()) {
    return { pairs, headerString: '', count: 0, hasAuthToken: false, hasCt0: false, hasTwid: false };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { pairs, headerString: '', count: 0, hasAuthToken: false, hasCt0: false, hasTwid: false };
    }

    for (const cookie of parsed) {
      if (cookie && typeof cookie === 'object' && typeof cookie.name === 'string' && cookie.name) {
        pairs[cookie.name] = cookie.value !== undefined ? String(cookie.value) : '';
      }
    }
  } catch {
    return { pairs, headerString: '', count: 0, hasAuthToken: false, hasCt0: false, hasTwid: false };
  }

  const headerString = Object.entries(pairs)
    .map(([k, v]) => (v ? `${k}=${v}` : k))
    .join('; ');

  return {
    pairs,
    headerString,
    count: Object.keys(pairs).length,
    hasAuthToken: 'auth_token' in pairs,
    hasCt0: 'ct0' in pairs,
    hasTwid: 'twid' in pairs,
  };
}

/**
 * Parses a Cookie-Editor "Header String" export into structured cookie data.
 */
export function parseCookieString(raw: string): ParsedCookies {
  const pairs: Record<string, string> = {};

  if (!raw || !raw.trim()) {
    return { pairs, headerString: '', count: 0, hasAuthToken: false, hasCt0: false, hasTwid: false };
  }

  const segments = raw.split(/;\s*(?=[a-zA-Z_])/);

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      pairs[trimmed] = '';
      continue;
    }

    const name = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();

    if (name) {
      pairs[name] = value;
    }
  }

  const headerString = Object.entries(pairs)
    .map(([k, v]) => (v ? `${k}=${v}` : k))
    .join('; ');

  return {
    pairs,
    headerString,
    count: Object.keys(pairs).length,
    hasAuthToken: 'auth_token' in pairs,
    hasCt0: 'ct0' in pairs,
    hasTwid: 'twid' in pairs,
  };
}

/** Default account config factory */
export function createDefaultAccount(id: string, name: string): AccountConfig {
  return {
    id,
    name,
    proxy: '',
    cookies: '',
    context: '',
    usernames: ['elonmusk', 'sama', 'karpathy', 'naval', 'paulg'],
    images: [],
    intervalMinutes: 15,
    usernamesPerTweet: 4,
  };
}

/** localStorage key helpers */
export const LS_ACCOUNTS_KEY = 'xautomate_accounts';
export const LS_ACTIVE_ACCOUNT_KEY = 'xautomate_active_account';

export function loadAccountsFromStorage(): AccountConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as AccountConfig[];
  } catch { /* ignore */ }
  return [];
}

export function saveAccountsToStorage(accounts: AccountConfig[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch { /* ignore */ }
}

export function loadActiveAccountId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LS_ACTIVE_ACCOUNT_KEY);
}

export function saveActiveAccountId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_ACTIVE_ACCOUNT_KEY, id);
}