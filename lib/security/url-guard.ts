/**
 * SSRF guard for user-supplied URLs (P-SEC-1).
 *
 * User-submitted image URLs are fetched server-side (directly here, and by the
 * AI SDK when a URL is passed to a model). Without a guard an attacker can point
 * the URL at cloud metadata (169.254.169.254), loopback, or internal services.
 *
 * Two layers:
 *   1. isSafePublicHttpUrl() — synchronous literal check for zod refinement
 *      (https only; reject IP-literal private ranges and internal hostnames).
 *   2. fetchGuardedImage() — resolves DNS and rejects any private address before
 *      fetching, with size + timeout caps, and returns the bytes so callers do
 *      not hand a raw URL to a downstream fetcher.
 *
 * Residual risk: DNS rebinding between our resolve and a downstream re-resolve is
 * mitigated by having callers use the returned bytes rather than the URL.
 */
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const INTERNAL_HOST_SUFFIXES = ['.local', '.internal', '.localhost', '.cluster.local'];
const INTERNAL_HOST_EXACT = new Set(['localhost', 'metadata', 'metadata.google.internal']);

function ipToBytes(ip: string): number[] | null {
  if (net.isIPv4(ip)) return ip.split('.').map((o) => parseInt(o, 10));
  return null;
}

/** True for loopback / private / link-local / CGNAT / unspecified addresses. */
export function isPrivateIp(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) → test the embedded v4.
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPrivateIp(mapped[1]);

  const v4 = ipToBytes(ip);
  if (v4) {
    const [a, b] = v4;
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 127) return true;                         // 127.0.0.0/8 loopback
    if (a === 0) return true;                           // 0.0.0.0/8
    if (a === 169 && b === 254) return true;            // 169.254.0.0/16 link-local (metadata)
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true;  // 100.64.0.0/10 CGNAT
    return false;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true; // loopback / unspecified
    if (lower.startsWith('fe80')) return true;          // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 ULA
    return false;
  }

  return true; // unparseable → treat as unsafe
}

/** Synchronous literal check suitable for a zod refinement. */
export function isSafePublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  // URL.hostname keeps brackets on IPv6 literals ([::1]) — strip them so
  // net.isIP / isPrivateIp see the bare address.
  const host = u.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (INTERNAL_HOST_EXACT.has(host)) return false;
  if (INTERNAL_HOST_SUFFIXES.some((s) => host.endsWith(s))) return false;
  // If the host is an IP literal, reject private ranges outright.
  if (net.isIP(host) && isPrivateIp(host)) return false;
  return true;
}

export interface GuardedImage {
  bytes: Uint8Array;
  contentType: string;
}

/**
 * Fetches an image from a user-supplied URL with SSRF protection:
 * https-only, DNS-resolved address must be public, size + timeout capped.
 * Returns the raw bytes so callers never pass the URL to another fetcher.
 */
export async function fetchGuardedImage(
  rawUrl: string,
  opts: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<GuardedImage> {
  const maxBytes = opts.maxBytes ?? 8 * 1024 * 1024; // 8 MB
  const timeoutMs = opts.timeoutMs ?? 8000;

  if (!isSafePublicHttpUrl(rawUrl)) {
    throw new Error('URL rejected: must be a public https URL');
  }
  const u = new URL(rawUrl);

  // Resolve DNS and reject if ANY resolved address is private.
  if (!net.isIP(u.hostname)) {
    const addrs = await lookup(u.hostname, { all: true });
    if (addrs.length === 0) throw new Error('URL rejected: host does not resolve');
    for (const a of addrs) {
      if (isPrivateIp(a.address)) throw new Error('URL rejected: resolves to a private address');
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(u, { signal: controller.signal, redirect: 'error' });
    if (!res.ok) throw new Error(`URL fetch failed: HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      throw new Error(`URL rejected: content-type is not an image (${contentType})`);
    }
    const len = Number(res.headers.get('content-length') ?? '0');
    if (len > maxBytes) throw new Error('URL rejected: image exceeds size limit');

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new Error('URL rejected: image exceeds size limit');
    return { bytes: buf, contentType };
  } finally {
    clearTimeout(timer);
  }
}
