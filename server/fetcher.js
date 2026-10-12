import { assertPublicUrl } from './ssrf.js';
import { HttpError } from './errors.js';

const UA = 'Mozilla/5.0 (compatible; DataLite/0.1; +reader-mode)';

/**
 * Fetches a URL with manual redirect handling so every hop is re-validated.
 * Returns { res, finalUrl }. The caller must read or cancel res.body.
 */
export async function fetchPublic(startUrl, opts = {}) {
  const { method = 'GET', timeoutMs = 8000, maxRedirects = 4, accept = '*/*' } = opts;
  let current = startUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current);
    let res;
    try {
      res = await fetch(url, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': UA, accept, 'accept-language': 'en' },
      });
    } catch (err) {
      const slow = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      throw new HttpError(
        502,
        'fetch_failed',
        slow ? 'The site took too long to respond.' : 'Could not reach that site.'
      );
    }

    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel?.().catch(() => {});
      try {
        current = new URL(location, url).href;
      } catch {
        throw new HttpError(502, 'fetch_failed', 'The site sent a broken redirect.');
      }
      continue;
    }
    return { res, finalUrl: url.href };
  }
  throw new HttpError(502, 'too_many_redirects', 'The site redirected too many times.');
}

/** Reads a response body with a hard byte cap. */
export async function readBody(res, maxBytes) {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel?.().catch(() => {});
    throw new HttpError(413, 'too_large', 'That page is too large for DataLite.');
  }
  if (!res.body) return Buffer.alloc(0);

  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, 'too_large', 'That page is too large for DataLite.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function decodeBody(buf, contentType = '') {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] || 'utf-8';
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}
