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
 *
 * Handles:
 *  - Semicolon-separated name=value pairs
 *  - Values containing = signs (e.g. base64, JSON)
 *  - URL-encoded values (e.g. guest_id=v1%3A...)
 *  - Quoted values (e.g. personalization_id="v1_...")
 *  - JSON-valued cookies (e.g. g_state={"i_l":2,...})
 *  - Leading/trailing whitespace around names and values
 */
export function parseCookieString(raw: string): ParsedCookies {
  const pairs: Record<string, string> = {};

  if (!raw || !raw.trim()) {
    return { pairs, headerString: '', count: 0, hasAuthToken: false, hasCt0: false, hasTwid: false };
  }

  // Split on semicolons, but be careful: values can contain semicolons inside
  // JSON objects like g_state={"i_l":2,"i_ll":...}
  // Strategy: split on "; " or ";" only when followed by a word-char (cookie name start)
  const segments = raw.split(/;\s*(?=[a-zA-Z_])/);

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    // Find the first = sign — everything before is the name, everything after is the value
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      // Cookie with no value (flag cookie) — store as empty string
      pairs[trimmed] = '';
      continue;
    }

    const name = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();

    if (name) {
      pairs[name] = value;
    }
  }

  // Rebuild a clean header string from parsed pairs
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