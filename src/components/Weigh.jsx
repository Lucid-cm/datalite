import { useEffect, useState } from 'react';
import { NAIRA_PER_MB } from '../config.js';
import { fmtBytes, fmtNaira, hostOf } from '../lib/format.js';
import { downloadCard } from '../lib/share.js';

function useCountUp(target, ms = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setValue(target);
      return undefined;
    }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export default function Weigh({ data }) {
  const { stats, url } = data;
  const { originalBytes, liteBytes, assets } = stats;
  const saved = Math.max(0, originalBytes - liteBytes);
  const pct = originalBytes ? Math.round((saved / originalBytes) * 100) : 0;
  const naira = (saved / (1024 * 1024)) * NAIRA_PER_MB;

  const shownOriginal = useCountUp(originalBytes);
  const shownLite = useCountUp(liteBytes);

  const [go, setGo] = useState(false);
  useEffect(() => {
    setGo(false);
    const id = requestAnimationFrame(() => setGo(true));
    return () => cancelAnimationFrame(id);
  }, [url, originalBytes]);

  const liteRatio = originalBytes ? Math.min(1, liteBytes / originalBytes) : 1;
  const [note, setNote] = useState('');

  async function share() {
    const link = `${location.origin}/?u=${encodeURIComponent(url)}`;
    const text = `I read ${hostOf(url)} with ${fmtBytes(liteBytes)} instead of ${fmtBytes(originalBytes)}+ using DataLite.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'DataLite', text, url: link });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${link}`);
      setNote('Link copied');
    } catch {
      setNote('Could not share. Copy the address bar link instead.');
    }
    setTimeout(() => setNote(''), 3000);
  }

  return (
    <section className="weigh" aria-labelledby="weigh-title">
      <h2 id="weigh-title" className="weigh-title">
        {hostOf(url)} costs {fmtBytes(shownOriginal)}+. DataLite reads it in {fmtBytes(shownLite)}.
      </h2>

      <div className="rows">
        <div className="row">
          <div className="row-label">
            <span>Original page</span>
            <strong>{fmtBytes(originalBytes)}+</strong>
          </div>
          <div className="track">
            <div className="fill fill-burn" style={{ width: go ? '100%' : '0%' }} />
          </div>
        </div>
        <div className="row">
          <div className="row-label">
            <span>With DataLite</span>
            <strong>{fmtBytes(liteBytes)}</strong>
          </div>
          <div className="track">
            <div className="fill fill-saved" style={{ width: go ? `${Math.max(1.5, liteRatio * 100)}%` : '0%' }} />
          </div>
        </div>
      </div>

      {saved > 0 ? (
        <p className="saved-line">
          <strong>{pct}% less data</strong>, about {fmtNaira(naira)} at {fmtNaira(NAIRA_PER_MB)} per MB.
        </p>
      ) : (
        <p className="saved-line">This page is already light. DataLite will not save much here.</p>
      )}

      <p className="fine">
        Original = the page plus {assets.measured} of {assets.total} linked files we could measure. Fonts,
        video, and anything loaded by scripts are not counted, so the real weight is higher. Costs are an
        estimate.
      </p>

      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={share}>
          Share result
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => downloadCard({ url, originalBytes, liteBytes, pct, naira })}
          disabled={saved === 0}
        >
          Save image card
        </button>
        <span className="note" role="status">{note}</span>
      </div>
    </section>
  );
}
