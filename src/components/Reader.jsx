import { hostOf } from '../lib/format.js';

export default function Reader({ data }) {
  const { title, byline, url, readingMinutes, html } = data;
  return (
    <article className="reader">
      <header className="reader-head">
        <h2>{title}</h2>
        <p className="meta">
          {[byline, `${readingMinutes} min read`].filter(Boolean).join(', ')}
          {' '}
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open original on {hostOf(url)}
          </a>
        </p>
      </header>
      {/* html is sanitized on the server (sanitize-html allowlist, no images, no scripts) */}
      <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
