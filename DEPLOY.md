# Deploying DataLite on Render (free)

## Before you start
- Code is pushed to GitHub (the repo you already made).
- `render.yaml` is in the repo root (it is, from this patch).

## Option A: Blueprint (fewest taps)
1. render.com, sign in with GitHub.
2. New, then **Blueprint**. Pick the `datalite` repo. Render reads `render.yaml`.
3. Approve. Wait for the build log to end with `DataLite API listening`.
4. Open the `datalite.onrender.com` link (a different name appears if it is taken).

## Option B: Manual
1. New, then **Web Service**, pick the repo.
2. Runtime: Node. Instance type: Free.
3. Build command: `npm install --include=dev --no-package-lock && npm run build`
4. Start command: `npm start`
5. Health check path: `/api/health`
6. Environment: `TRUST_PROXY=1`, `NODE_VERSION=22`.

## After it is live
1. Open `/api/health`. It should show `{"ok":true}`.
2. Look up the Lagos sample link. Watch the Render logs for the timing line:
   `lite en.wikipedia.org fetch=...ms parse=...ms total=...ms`
3. Free instances sleep after 15 idle minutes (about a minute to wake). For launch week,
   point a free uptime pinger (UptimeRobot or cron-job.org) at `/api/health` every 10 minutes.
   Express answers HEAD requests on that route too.
4. Updates: `git add -A && git commit -m "msg" && git push`. Render redeploys by itself.

## If the build fails
Copy the last 20 lines of the build log and open an issue with them. Common causes:
- Wrong Node version: confirm `NODE_VERSION=22` is set.
- `vite: not found`: the build command must include `--include=dev`.
