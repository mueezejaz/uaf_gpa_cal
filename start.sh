#!/bin/sh
set -e

echo "Starting application on port ${PORT}..."

python backend/app.py &
APP_PID=$!

sleep 2

echo "Starting Cloudflare Quick Tunnel..."

cloudflared tunnel \
  --no-autoupdate \
  --url "http://127.0.0.1:${PORT}" \
  2>&1 | tee /tmp/cloudflared.log &

TUNNEL_PID=$!

(
    while true
    do
        URL=$(grep -oE 'https://[^ ]*trycloudflare\.com' /tmp/cloudflared.log | head -n 1)

        if [ -n "$URL" ]; then
            echo "========================================"
            echo "PUBLIC CLOUDFLARE URL:"
            echo "$URL"
            echo "========================================"
            break
        fi

        sleep 1
    done
) &

cleanup() {
    echo "Stopping services..."
    kill "$APP_PID" 2>/dev/null || true
    kill "$TUNNEL_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

wait "$APP_PID"
