#!/usr/bin/env bash
# The game server on localhost only (Caddy is the one public door, on Render's PORT); if either stops, the container stops and
# Render restarts it.
set -euo pipefail
(cd /app/apps/server && HOST=127.0.0.1 PORT=3001 exec ./node_modules/.bin/tsx src/main.ts) &
caddy run --config /app/deploy/Caddyfile --adapter caddyfile &
trap 'kill -TERM $(jobs -p) 2>/dev/null' TERM INT
wait -n
exit 1
