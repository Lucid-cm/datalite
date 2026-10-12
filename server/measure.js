import { fetchPublic } from './fetcher.js';

/**
 * Estimates the weight of linked files with HEAD requests.
 * Result is a floor: files without a content-length, CSS-loaded fonts/images,
 * and anything fetched by scripts at runtime are not counted.
 */
export async function measureAssets(urls, { concurrency = 8, perRequestMs = 4000, budgetMs = 7000 } = {}) {
  const queue = [...urls];
  const deadline = Date.now() + budgetMs;
  let bytes = 0;
  let measured = 0;

  async function worker() {
    while (queue.length && Date.now() < deadline) {
      const target = queue.shift();
      try {
        const { res } = await fetchPublic(target, { method: 'HEAD', timeoutMs: perRequestMs, maxRedirects: 3 });
        const len = Number(res.headers.get('content-length'));
        if (res.ok && Number.isFinite(len) && len > 0) {
          bytes += len;
          measured += 1;
        }
      } catch {
        /* counts as unmeasured */
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return { bytes, measured, attempted: urls.length };
}
