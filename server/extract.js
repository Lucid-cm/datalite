import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import sanitizeHtml from 'sanitize-html';
import { HttpError } from './errors.js';

export const MAX_ASSETS_TO_MEASURE = 40;

const SANITIZE = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'blockquote', 'pre', 'code', 'em', 'strong', 'b', 'i', 'sup', 'sub', 'a',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption',
  ],
  allowedAttributes: { a: ['href', 'title', 'rel', 'target'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, rel: 'noopener noreferrer nofollow', target: '_blank' },
    }),
  },
};

function toAbsolute(value, base) {
  try {
    const u = new URL(value, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function collectAssets(document, baseUrl) {
  const seen = new Set();
  const counts = { scripts: 0, styles: 0, images: 0 };
  const add = (value, key) => {
    if (!value) return;
    const href = toAbsolute(value, baseUrl);
    if (!href || seen.has(href)) return;
    seen.add(href);
    counts[key] += 1;
  };
  document.querySelectorAll('script[src]').forEach((n) => add(n.getAttribute('src'), 'scripts'));
  document.querySelectorAll('link[rel~="stylesheet"][href]').forEach((n) => add(n.getAttribute('href'), 'styles'));
  document.querySelectorAll('img[src]').forEach((n) => add(n.getAttribute('src'), 'images'));
  return { urls: [...seen], counts, total: seen.size };
}

/**
 * Turns raw HTML into a sanitized reader-mode article plus asset inventory.
 * NOTE: runs synchronously on the main thread. For production traffic, move
 * this into a worker thread so one big page cannot stall other requests.
 */
export function extractReadable(html, finalUrl) {
  let document;
  try {
    ({ document } = parseHTML(html));
  } catch {
    throw new HttpError(422, 'no_content', 'Could not read that page.');
  }

  const assets = collectAssets(document, finalUrl);

  document.querySelectorAll('a[href]').forEach((a) => {
    const abs = toAbsolute(a.getAttribute('href'), finalUrl);
    if (abs) a.setAttribute('href', abs);
  });

  let article = null;
  try {
    article = new Readability(document, { charThreshold: 200 }).parse();
  } catch {
    article = null;
  }
  if (!article?.content) {
    throw new HttpError(
      422,
      'no_content',
      'No readable article found. The page may need JavaScript to show its content.'
    );
  }

  const clean = sanitizeHtml(article.content, SANITIZE);
  const words = (article.textContent || '').trim().split(/\s+/).filter(Boolean).length;

  return {
    title: (article.title || '').trim() || new URL(finalUrl).hostname,
    byline: (article.byline || '').trim() || null,
    siteName: (article.siteName || '').trim() || null,
    excerpt: (article.excerpt || '').trim() || null,
    html: clean,
    words,
    readingMinutes: Math.max(1, Math.round(words / 220)),
    assets,
  };
}
