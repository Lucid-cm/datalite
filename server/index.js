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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_HTML_BYTES = 2_500_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 100;
const RATE_LIMIT = 20; // requests per minute per IP
const RATE_WINDOW_MS = 60 * 1000;

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

/* ---------- tiny in-memory rate limiter ---------- */
const hits = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, h] of hits) if (h.reset <= now) hits.delete(ip);
}, RATE_WINDOW_MS).unref();

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

/* ---------- tiny TTL cache ---------- */
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

/* ---------- API ---------- */
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/lite', rateLimit, async (req, res, next) => {
  try {
    const raw = String(req.query.url || '').trim();
    if (!raw) throw new HttpError(400, 'bad_url', 'Paste a link first.');
    if (raw.length > 2048) throw new HttpError(400, 'bad_url', 'That link is too long.');

    const target = normalizeInput(raw);
    const cached = cacheGet(target);
    if (cached) return res.json({ ...cached, cached: true });

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
    const buf = await readBody(upstream, MAX_HTML_BYTES);
    const htmlWireBytes = Number.isFinite(declared) && declared > 0 ? declared : buf.length;

    const page = extractReadable(decodeBody(buf, type), finalUrl);
    const measured = await measureAssets(page.assets.urls.slice(0, MAX_ASSETS_TO_MEASURE));

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
        htmlBytes: htmlWireBytes,
        assetBytes: measured.bytes,
        originalBytes: htmlWireBytes + measured.bytes,
        liteBytes,
        assets: {
          total: page.assets.total,
          measured: measured.measured,
          ...page.assets.counts,
        },
      },
    };
    cacheSet(target, result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Unknown API route.' } });
});

/* ---------- static client (after `npm run build`) ---------- */
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST, { maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
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
