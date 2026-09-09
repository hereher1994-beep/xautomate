/**
 * proxyAgent.ts
 * Returns the correct Node.js http.Agent for a given proxy URL string.
 * Supports: http://, https://, socks4://, socks5://
 * Returns undefined if no proxy is provided (direct connection).
 *
 * Usage:
 *   const agent = buildProxyAgent(proxy);
 *   const res = await fetch(url, { ..., agent } as any);
 */

import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

export type ProxyAgent = HttpsProxyAgent<string> | SocksProxyAgent | undefined;

/**
 * Parse and normalise a proxy string.
 * Accepts formats:
 *   host:port
 *   user:pass@host:port
 *   http://host:port
 *   socks5://user:pass@host:port
 *   etc.
 */
function normaliseProxy(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Already has a scheme
  if (/^(https?|socks[45h]):\/\//i.test(trimmed)) return trimmed;

  // No scheme — default to http
  return `http://${trimmed}`;
}

/**
 * Build and return the appropriate proxy agent, or undefined for direct connections.
 */
export function buildProxyAgent(proxy?: string | null): ProxyAgent {
  if (!proxy) return undefined;

  const url = normaliseProxy(proxy);
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    const scheme = parsed.protocol.replace(':', '').toLowerCase();

    if (scheme === 'socks4' || scheme === 'socks5' || scheme === 'socks4h' || scheme === 'socks5h' || scheme === 'socks') {
      return new SocksProxyAgent(url);
    }

    // http or https proxy
    return new HttpsProxyAgent(url);
  } catch (err) {
    console.warn('[proxyAgent] Invalid proxy URL, using direct connection:', proxy, err);
    return undefined;
  }
}

/**
 * Wrap fetch options with the proxy agent.
 * Node.js fetch (undici) accepts `dispatcher` but the native Node 18+ fetch
 * and next.js patched fetch accept `agent` via the RequestInit extension.
 * We cast to `any` to avoid TypeScript complaints.
 */
export function withProxy(
  init: RequestInit,
  proxy?: string | null
): RequestInit {
  const agent = buildProxyAgent(proxy);
  if (!agent) return init;
  return { ...init, agent } as any;
}
