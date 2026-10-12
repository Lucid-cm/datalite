#!/bin/sh
# Runs API (8787) and Vite (5173) together. Ctrl-C stops both.
node --watch server/index.js &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT INT TERM
npx vite
