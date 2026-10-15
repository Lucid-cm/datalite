# DataLite performance patch

## What was slow

1. **Measuring linked files blocked the whole response.** Up to 7 seconds of HEAD requests ran before anything came back.
2. **One DNS lookup per file.** A page with 60 files did 60 lookups through a small thread pool.
3. **Heavy DOM parsing** of big pages (the work grows with page size).
4. **Repeat work:** the same link clicked twice at the same time did everything twice.

## What changed

| Change | Effect |
|---|---|
| Two-phase response: `/api/lite` returns the article right after fetch + parse; `/api/weigh` delivers the measurement when ready | Reading starts several seconds sooner. The weigh-in bars fill in when the numbers arrive |
| DNS cache (60 s) for validated hosts | 60 files on 6 hosts = 6 lookups |
| Measuring tuned: 16 at a time, 2.5 s per request, 4 s overall budget, up to 60 files | Bounded wait, better coverage |
| HTML capped at 1.5 MB (first part kept) | Parsing stays quick on huge pages |
| Heavy tags (script, style, svg, iframe...) removed before Readability | Smaller DOM, less CPU |
| Request coalescing | Two people loading the same link share one job |
| Bigger result cache (200 entries, 10 min) | Repeat links return instantly |
| Static files: hashed `/assets` cached 1 year, `index.html` always fresh | Repeat visits load almost nothing |
| Share-card code loads only when "Save image card" is tapped | Smaller first load |
| `Server-Timing` header and a log line per request | You can see where time goes |

## How to see timings

Terminal log, one line per lookup:
```
lite en.wikipedia.org fetch=420ms parse=380ms total=800ms
```
Or in Chrome DevTools, Network tab, click `lite`, Timing tab (Server Timing section).

## Honest limits

- **Test coverage:** unit tests cover the job store, request coalescing, body truncation, and the link-safety guard (`npm test`). End-to-end behavior depends on the host and the sites being fetched.
- **Render's free instance has very little CPU.** Parsing a big page can be several times slower there than on your phone. If `parse=` in the log is high on Render, the fix is a paid instance, not more code.
- **Cold start:** a free service sleeps after 15 idle minutes and takes about a minute to wake. A free uptime pinger hitting `/api/health` every 10 minutes keeps it warm.
- **Truncated pages:** a page bigger than 1.5 MB is cut. Articles near the end may be missing. Raise `MAX_HTML_BYTES` in `server/index.js` if that bites.
- **Still on the main thread:** parsing blocks other requests while it runs. Production fix is worker threads.

## Tuning knobs (`server/index.js`, `server/measure.js`)

- `MAX_HTML_BYTES`: lower = faster, but may cut content
- `measureAssets` `budgetMs` and `concurrency`: lower the budget for a faster weigh-in (fewer files measured)
- `CACHE_TTL_MS`: longer = more instant repeats
