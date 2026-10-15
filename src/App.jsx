import { useEffect, useRef, useState } from 'react';
import { fetchLite } from './lib/api.js';
import { SAMPLES } from './config.js';
import Weigh from './components/Weigh.jsx';
import Reader from './components/Reader.jsx';
import Support from './components/Support.jsx';

export default function App() {
  const [input, setInput] = useState('');
  const [state, setState] = useState({ status: 'idle' });
  const abortRef = useRef(null);
  const resultRef = useRef(null);

  async function run(target) {
    const value = target.trim();
    if (!value) {
      setState({ status: 'error', message: 'Paste a link first.' });
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ status: 'loading' });
    try {
      const data = await fetchLite(value, ctrl.signal);
      setState({ status: 'done', data });
      history.replaceState(null, '', `?u=${encodeURIComponent(data.url)}`);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setState({ status: 'error', message: err.message });
    }
  }

  useEffect(() => {
    const shared = new URLSearchParams(location.search).get('u');
    if (shared) {
      setInput(shared);
      run(shared);
    }
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loading = state.status === 'loading';

  return (
    <>
      <header className="top">
        <span className="wordmark">DataLite</span>
      </header>

      <main>
        <section className="hero">
          <h1>Paste a link. See what the page really costs. Read it for less.</h1>
          <form
            className="lookup"
            onSubmit={(e) => {
              e.preventDefault();
              run(input);
            }}
          >
            <label htmlFor="url" className="sr-only">Page link</label>
            <input
              id="url"
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="example.com/some-long-article"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className="btn btn-solid" disabled={loading}>
              {loading ? 'Weighing' : 'Lite it'}
            </button>
          </form>

          <p className="samples">
            Try{' '}
            {SAMPLES.map((s, i) => (
              <span key={s.url}>
                {i > 0 && ' or '}
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setInput(s.url);
                    run(s.url);
                  }}
                >
                  {s.label}
                </button>
              </span>
            ))}
          </p>
        </section>

        <div ref={resultRef} className="result" aria-live="polite">
          {loading && (
            <>
              <p className="status">Fetching and reading the page. A few seconds.</p>
              <div className="skeleton" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </>
          )}
          {state.status === 'error' && (
            <p className="status status-error" role="alert">
              {state.message}
            </p>
          )}
          {state.status === 'done' && (
            <>
              <Weigh data={state.data} />
              <Reader data={state.data} />
            </>
          )}
        </div>

        <Support />
      </main>

      <footer className="foot">
        <p>Built on an Android phone in Termux. Images and scripts are removed on purpose.</p>
      </footer>
    </>
  );
}
