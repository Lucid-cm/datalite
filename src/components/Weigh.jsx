import { useEffect, useState } from 'react';
import { NAIRA_PER_MB } from '../config.js';
import { fmtBytes, fmtNaira, hostOf } from '../lib/format.js';
import { fetchWeigh } from '../lib/api.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

/** Asks the server for the linked-file measurement that runs in the background. */
function useWeigh(weighId) {
  const [weigh, setWeigh] = useState({ status: 'pending' });
  useEffect(() => {
    if (!weighId) {
      setWeigh({ status: 'failed' });
      return undefined;
    }
    const ctrl = new AbortController();
    let alive = true;
    setWeigh({ status: 'pending' });
    (async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const r = await fetchWeigh(weighId, ctrl.signal);
          if (!alive) return;
          if (r.pending) {
            await sleep(800);
            continue;
          }
          if (r.failed) break;
          setWeigh({ status: 'ready', assetBytes: r.assetBytes, measured: r.measured });
          return;
        } catch (err) {
          if (!alive || err?.name === 'AbortError') return;
          break;
        }
      }
      if (alive) setWeigh({ status: 'failed' });
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [weighId]);
  return weigh;
}

export default function Weigh({ data }) {
  const { stats, url } = data;
  const { htmlBytes, liteBytes, assets, weighId } = stats;

  const weigh = useWeigh(weighId);
  const pending = weigh.status === 'pending';
  const originalBytes = htmlBytes + (weigh.status === 'ready' ? weigh.assetBytes : 0);

  const saved = Math.max(0, originalBytes - liteBytes);
  const pct = originalBytes ? Math.round((saved / originalBytes) * 100) : 0;
  const naira = (saved / (1024 * 1024)) * NAIRA_PER_MB;

  const shownOriginal = useCountUp(pending ? 0 : originalBytes);
  const shownLite = useCountUp(liteBytes);

  const [go, setGo] = useState(false);
  useEffect(() => {
    setGo(false);
    if (pending) return undefined;
    const id = requestAnimationFrame(() => setGo(true));
    return () => cancelAnimationFrame(id);
  }, [url, pending, originalBytes]);

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

  async function saveCard() {
    const { downloadCard } = await import('../lib/share.js'); // loaded only when needed
    downloadCard({ url, originalBytes, liteBytes, pct, naira });
  }

  return (
    <section className="weigh" aria-labelledby="weigh-title">
      <h2 id="weigh-title" className="weigh-title">
        {pending
          ? `${hostOf(url)}: DataLite reads it in ${fmtBytes(shownLite)}. Weighing the original page\u2026`
          : weigh.status === 'ready'
            ? `${hostOf(url)} costs ${fmtBytes(shownOriginal)}+. DataLite reads it in ${fmtBytes(shownLite)}.`
            : `${hostOf(url)}: DataLite reads it in ${fmtBytes(shownLite)}.`}
      </h2>

      <div className="rows">
        <div className="row">
          <div className="row-label">
            <span>Original page</span>
            <strong>{pending ? 'weighing' : `${fmtBytes(originalBytes)}+`}</strong>
          </div>
          <div className="track">
            {pending ? (
              <div className="fill fill-pending" />
            ) : (
              <div className="fill fill-burn" style={{ width: go ? '100%' : '0%' }} />
            )}
          </div>
        </div>
        <div className="row">
          <div className="row-label">
            <span>With DataLite</span>
            <strong>{fmtBytes(liteBytes)}</strong>
          </div>
          <div className="track">
            <div
              className="fill fill-saved"
              style={{ width: go ? `${Math.max(1.5, liteRatio * 100)}%` : '0%' }}
            />
          </div>
        </div>
      </div>

      {!pending && (
        <>
          {saved > 0 ? (
            <p className="saved-line">
              <strong>{pct}% less data</strong>, about {fmtNaira(naira)} at {fmtNaira(NAIRA_PER_MB)} per MB.
            </p>
          ) : (
            <p className="saved-line">This page is already light. DataLite will not save much here.</p>
          )}

          <p className="fine">
            {weigh.status === 'ready'
              ? `Original = the page plus ${weigh.measured} of ${assets.total} linked files we could measure. Fonts, video, and anything loaded by scripts are not counted, so the real weight is higher. Costs are an estimate.`
              : 'The linked files could not be measured this time, so the original shows the page itself only. The real weight is higher.'}
          </p>

          <div className="actions">
            <button type="button" className="btn btn-ghost" onClick={share}>
              Share result
            </button>
            <button type="button" className="btn btn-ghost" onClick={saveCard} disabled={saved === 0}>
              Save image card
            </button>
            <span className="note" role="status">{note}</span>
          </div>
        </>
      )}
    </section>
  );
}
