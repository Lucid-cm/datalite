import express from 'express';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { HttpError } from './errors.js';
import { normalizeInput } from './ssrf.js';
import { fetchPublic, readBody, decodeBody } from './fetcher.js';
import { extractReadable, MAX_ASSETS_TO_MEASURE } from './extract.js';
import { measureAssets } from './measure.js';
import { createJobStore, createCoalescer, waitFor } from './jobs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_HTML_BYTES = 1_500_000; // keep the first 1.5 MB; parsing cost grows with size
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;
const RATE_LIMIT = 30; // /api/lite requests per minute per IP
const RATE_WINDOW_MS = 60 * 1000;
const WEIGH_WAIT_MS = 6000; // how long /api/weigh holds the request open

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

/* ---------- security headers ---------- */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
  next();
});
app.use(compression());

/* ---------- in-memory rate limiter ---------- */
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const ip = req.ip || 'unknown';
  let h = hits.get(ip);
  if (!h || h.reset <= now) {
    h = { count: 0, reset: now + RATE_WINDOW_MS };
    hits.set(ip, h);
  }
  h.count += 1;
  if (h.count > RATE_LIMIT) {
    res.setHeader('Retry-After', Math.ceil((h.reset - now) / 1000));
    return next(new HttpError(429, 'rate_limited', 'Too many requests. Wait a minute and try again.'));
  }
  next();
}

/* ---------- result cache, background jobs, request coalescing ---------- */
const cache = new Map();
function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}
function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

// Job TTL is a little longer than the cache TTL so a cached result never points at a dead job.
const jobs = createJobStore(CACHE_TTL_MS + 60 * 1000);
const coalesce = createCoalescer();

setInterval(() => {
  const now = Date.now();
  for (const [ip, h] of hits) if (h.reset <= now) hits.delete(ip);
  jobs.prune();
}, RATE_WINDOW_MS).unref();

/* ---------- core work ---------- */
async function buildResult(target) {
  const t0 = performance.now();

  const { res: upstream, finalUrl } = await fetchPublic(target, {
    accept: 'text/html,application/xhtml+xml',
  });
  if (!upstream.ok) {
    await upstream.body?.cancel?.().catch(() => {});
    throw new HttpError(502, 'upstream_status', `The site answered with status ${upstream.status}.`);
  }

  const type = upstream.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
    await upstream.body?.cancel?.().catch(() => {});
    throw new HttpError(415, 'not_html', 'That link is not a web page DataLite can read.');
  }

  const declared = Number(upstream.headers.get('content-length'));
  const buf = await readBody(upstream, MAX_HTML_BYTES, { truncate: true });
  const htmlBytes = Number.isFinite(declared) && declared > 0 ? declared : buf.length;
  const t1 = performance.now();

  const page = extractReadable(decodeBody(buf, type), finalUrl);
  const t2 = performance.now();

  // Measuring linked files is the slowest step, so it runs in the background.
  // The article is returned now; the client asks /api/weigh for the numbers.
  const job = jobs.start(() => measureAssets(page.assets.urls.slice(0, MAX_ASSETS_TO_MEASURE)));

  const payload = {
    url: finalUrl,
    title: page.title,
    byline: page.byline,
    siteName: page.siteName,
    excerpt: page.excerpt,
    html: page.html,
    words: page.words,
    readingMinutes: page.readingMinutes,
  };
  // Uncompressed JSON size plus a margin for the stats block: conservative,
  // since the real response is gzip-compressed.
  const liteBytes = Buffer.byteLength(JSON.stringify(payload)) + 300;

  const result = {
    ...payload,
    stats: {
      htmlBytes,
      liteBytes,
      weighId: job.id,
      assets: { total: page.assets.total, ...page.assets.counts },
    },
  };
  cacheSet(target, result);

  return { result, timings: { fetch: t1 - t0, parse: t2 - t1, total: performance.now() - t0 } };
}

/* ---------- API ---------- */
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/lite', rateLimit, async (req, res, next) => {
  try {
    const raw = String(req.query.url || '').trim();
    if (!raw) throw new HttpError(400, 'bad_url', 'Paste a link first.');
    if (raw.length > 2048) throw new HttpError(400, 'bad_url', 'That link is too long.');

    const target = normalizeInput(raw);
    res.setHeader('Cache-Control', 'public, max-age=120');

    const cached = cacheGet(target);
    if (cached) {
      res.setHeader('Server-Timing', 'cache;dur=0');
      return res.json({ ...cached, cached: true });
    }

    const { result, timings } = await coalesce(target, () => buildResult(target));
    res.setHeader(
      'Server-Timing',
      `fetch;dur=${timings.fetch.toFixed(0)}, parse;dur=${timings.parse.toFixed(0)}, total;dur=${timings.total.toFixed(0)}`
    );
    console.log(
      `lite ${new URL(result.url).hostname} fetch=${timings.fetch.toFixed(0)}ms parse=${timings.parse.toFixed(0)}ms total=${timings.total.toFixed(0)}ms`
    );
    res.json(result);
  } catch (err) {
    res.removeHeader('Cache-Control');
    next(err);
  }
});

app.get('/api/weigh', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const job = jobs.get(String(req.query.id || ''));
    if (!job) throw new HttpError(404, 'expired', 'That measurement expired. Run the page again.');

    const value = await waitFor(job, WEIGH_WAIT_MS);
    if (value === undefined) return res.json({ pending: true });
    if (value === null) return res.json({ failed: true });
    res.json({ assetBytes: value.bytes, measured: value.measured, attempted: value.attempted });
  } catch (err) {
    next(err);
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Unknown API route.' } });
});

/* ---------- static client (after `npm run build`) ---------- */
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  // Vite file names in /assets contain a content hash, so they can be cached for a year.
  app.use('/assets', express.static(path.join(DIST, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(
    express.static(DIST, {
      maxAge: '1h',
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

/* ---------- errors ---------- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: { code: 'internal', message: 'Something broke on our side. Try again.' } });
});

app.listen(PORT, HOST, () => {
  console.log(`DataLite API listening on http://${HOST}:${PORT}`);
});
