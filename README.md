# DataLite

Paste a link. DataLite fetches the page, strips it to the readable article, and shows a
side-by-side weigh-in: what the page costs in data vs what DataLite sends you.

Stack: Node (Express) + React/Vite. No image library, no database, no external fonts.

## Run it in Termux

```sh
pkg update && pkg install nodejs git zip unzip
unzip datalite.zip && cd datalite
npm install --no-audit --no-fund
npm run dev          # API on :8787, Vite on :5173
```

Open http://localhost:5173 in your phone browser.

Do `npm install` once, on the cheapest data you have. Dependencies (mostly Vite, esbuild, rollup, React)
are the biggest download; after that everything runs offline except the pages you actually look up.

If `npm install` or `vite` fails on esbuild or rollup in Termux, send me the exact error. Fallback:
you only need Node to edit and push; let Render or Cloudflare Pages run `npm install && npm run build`
for you.

## Before you deploy

1. Edit `src/config.js`: set `paymentLink` (Paystack, Selar or Flutterwave page), optional `usdcAddress`
   and `usdcNetwork`, `goal`, and keep `raised` updated by hand. Empty values hide the support section.
2. Set `NAIRA_PER_MB` to your real bundle price.
3. `npm run build && npm start` serves the API and the built client together on one port.

### Deploy free (Render web service)

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Env var: `TRUST_PROXY=1`

Free tiers sleep when idle, so the first request after a pause is slow. Open it once before you post.

## How the numbers work

- **Original** = the page's HTML size (content-length when the site sends it) + the size of up to 40
  linked scripts, stylesheets and images, read with HEAD requests.
- It is a **floor**: fonts, video, CSS-loaded images and anything fetched by scripts are not counted.
  The UI says so. Do not claim exact savings in your GDG post; say "at least".
- **DataLite** = size of the JSON the API returns, uncompressed (the real transfer is gzip-compressed,
  so the true figure is smaller).
- Naira cost = bytes / 1 MB x `NAIRA_PER_MB`. It is an estimate.

## MVP shortcuts vs production

| Area | In this MVP | Production version |
|---|---|---|
| SSRF protection | Blocks private IPs, odd ports, credentials, re-checks every redirect | Also pin the resolved IP into the connection (stops DNS rebinding), or run fetching in an isolated network |
| CPU load | HTML parsing runs on the main thread | Worker threads or a job queue |
| Rate limit / cache | In memory, per process | Redis, shared across instances |
| Images | Removed entirely | Optional compressed proxy (`sharp`; hard to install on Termux) |
| JS-rendered pages | Not supported, returns a clear error | Headless browser fallback (heavy, paid) |
| Observability | `console.error` | Structured logs, error tracking, uptime check |
| Tests | Unit tests for the SSRF guard (`npm test`) | Add extraction fixtures and API integration tests |

## Legal and etiquette

DataLite re-displays other sites' text for personal reading and always links to the original.
Keep it that way: no ads on top of other people's content, and respect takedown requests.

## What was verified

The SSRF guard unit tests pass (`npm test`) and all server files pass a syntax check. The
full app (npm install, Vite build, live fetching) could not be run in the environment where this was
generated because it had no network, so your first run is the real integration test.
