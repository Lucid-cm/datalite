import dns from 'node:dns/promises';
import net from 'node:net';
import { HttpError } from './errors.js';

const ALLOWED_PORTS = new Set(['', '80', '443']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home'];

export function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

export function isPrivateIPv6(ip) {
  const s = ip.toLowerCase().split('%')[0];
  if (s === '::' || s === '::1') return true;

  const mappedDotted = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedDotted) return isPrivateIPv4(mappedDotted[1]);

  const mappedHex = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }

  if (s.startsWith('::')) return true; // loopback, unspecified, v4-compatible forms
  const first = parseInt(s.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (s.startsWith('64:ff9b:')) return true; // NAT64
  if (s.startsWith('2001:db8')) return true; // documentation
  return false;
}

export function isPrivateIp(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind === 6) return isPrivateIPv6(ip);
  return true;
}

/** Adds https:// when the person typed a bare domain. */
export function normalizeInput(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

// Short-lived DNS cache. A page with 60 assets on 6 hosts needs 6 lookups, not 60.
// Trade-off: slightly longer window for DNS changes to be noticed.
const DNS_TTL_MS = 60 * 1000;
const DNS_MAX = 500;
const dnsCache = new Map();

function resolveHost(host) {
  const now = Date.now();
  const hit = dnsCache.get(host);
  if (hit && hit.expires > now) return hit.promise;

  if (dnsCache.size >= DNS_MAX) dnsCache.delete(dnsCache.keys().next().value);
  const promise = dns.lookup(host, { all: true, verbatim: true });
  dnsCache.set(host, { promise, expires: now + DNS_TTL_MS });
  promise.catch(() => dnsCache.delete(host));
  return promise;
}

/**
 * Throws unless the URL is plain http(s) on a standard port and every address
 * its hostname resolves to is public.
 * Known gap: DNS can change between this check and the actual connection
 * (DNS rebinding). For production, pin the resolved IP in the connection or
 * run the fetcher in a network-isolated worker.
 */
export async function assertPublicUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, 'bad_url', 'That does not look like a valid link.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'bad_url', 'Only http and https links work.');
  }
  if (url.username || url.password) {
    throw new HttpError(400, 'bad_url', 'Links with a username or password are not supported.');
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new HttpError(400, 'blocked', 'That port is not allowed.');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new HttpError(400, 'blocked', 'That address is not allowed.');
  }

  const kind = net.isIP(host);
  if (kind) {
    if (isPrivateIp(host)) throw new HttpError(400, 'blocked', 'That address is not allowed.');
    return url;
  }

  let addrs;
  try {
    addrs = await resolveHost(host);
  } catch {
    throw new HttpError(502, 'dns_failed', 'Could not find that site. Check the spelling.');
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new HttpError(400, 'blocked', 'That address is not allowed.');
  }
  return url;
}
