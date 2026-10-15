# DataLite

Paste a link. See what the page really costs in data. Read it for a fraction.

DataLite fetches a web page on the server, strips it down to the readable article, and shows a
side-by-side weigh-in: the page's weight vs what DataLite sends you. Built for people on expensive,
unreliable mobile data.

## What it does

- Reads article-style pages and returns clean text (no ads, scripts, or images).
- Shows the original page weight against the DataLite weight, with an estimated cost in naira.
- Lets you share the result as a link or a downloadable image card.
- Loads fast: the article appears first, and the weigh-in fills in when it is ready.

## How the numbers work

- **Original** = the page's HTML size plus the size of up to 60 linked scripts, stylesheets, and
  images, measured with HEAD requests.
- It is a **floor**. Fonts, video, CSS-loaded images, and anything fetched by scripts at runtime are
  not counted, so the real weight is higher. The interface says so.
- **DataLite** = the size of the JSON the API returns, uncompressed (real transfer is gzip-compressed,
  so the true figure is smaller).
- Cost = megabytes saved x `NAIRA_PER_MB` in `src/config.js`. It is an estimate.

## Run it locally

Works on any machine with Node 18 or newer, including Android with Termux.

```sh
git clone https://github.com/<Lucid-cm>/datalite.git
cd datalite
npm install --no-audit --no-fund
npm test
npm run dev          # open http://localhost:5173
```

Production-style, one port:

```sh
npm run build && npm start     # http://localhost:8787
```

On Termux: `pkg install nodejs git`, then the same commands.

## Configure

Everything user-facing lives in `src/config.js`:

- `NAIRA_PER_MB`: your data price for the cost estimate.
- `SAMPLES`: the example links.
- `SUPPORT`: the optional support card (goal, amount raised, bank-transfer details, payment link,
  crypto address). Empty values hide the matching part. **Anything here is public once pushed.**

Server settings are environment variables: `PORT`, `HOST`, `TRUST_PROXY` (set to `1` behind a proxy).

## Deploy

A `render.yaml` Blueprint is included for Render's free plan. See [DEPLOY.md](DEPLOY.md).
Free instances sleep when idle, so the first request after a quiet period can take about a minute.

## Architecture

```
server/   Express API: safe fetching, extraction, measuring, caching
src/      React + Vite client
test/     node:test unit tests
```

- `/api/lite` fetches the page, extracts the article (Mozilla Readability + linkedom), sanitizes it
  with an allowlist, and returns it with a job id.
- `/api/weigh` returns the linked-file measurement, which runs in the background.
- Results are cached for 10 minutes; identical concurrent requests share one job.
- See [PERFORMANCE.md](PERFORMANCE.md) for the speed design and tuning knobs.

## Security notes

- Server-side fetching blocks private and internal addresses, non-standard ports, credentials in
  URLs, and re-checks every redirect.
- Fetched HTML is sanitized with an allowlist before it reaches the page. Images and scripts are
  removed on purpose.
- Responses carry a strict Content-Security-Policy and related headers.
- Known gap: DNS can change between the address check and the connection (DNS rebinding). A hardened
  deployment should pin the resolved IP or run fetching in an isolated network.

## Known limits (MVP vs production)

| Area | Now | Production version |
|---|---|---|
| JavaScript-rendered pages | Not supported; returns a clear error | Headless-browser fallback |
| Parsing | Runs on the main thread | Worker threads or a job queue |
| Rate limit and cache | In memory, per process | Shared store such as Redis |
| Images | Removed | Optional compressed image proxy |
| Large pages | First 1.5 MB is read | Streaming extraction |
| Observability | Timing logs and `Server-Timing` header | Structured logs, error tracking, uptime checks |

DataLite re-displays other sites' text for personal reading and always links to the original. Please
keep it that way: no ads over other people's content, and respect takedown requests.

## Built on a phone

The first version was written and run entirely in Termux on an Android phone, on mobile data.

## Contributing

Issues and pull requests are welcome. Run `npm test` before sending a change.

## License

MIT. See [LICENSE](LICENSE).
