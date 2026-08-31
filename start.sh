#!/bin/sh
set -e

echo "Starting application on port ${PORT}..."

python backend/app.py &
APP_PID=$!

# Give the application a moment to start
sleep 2

echo "Starting Cloudflare Quick Tunnel..."
echo "The public URL will appear below."

cloudflared tunnel \
  --no-autoupdate \
  --url "http://127.0.0.1:${PORT}" 2>&1 | while IFS= read -r line
do
    echo "[cloudflared] $line"

    case "$line" in
        *trycloudflare.com*)
            echo "========================================"
            echo "PUBLIC CLOUDFLARE URL:"
            echo "$line"
            echo "========================================"
            ;;
    esac
done &

TUNNEL_PID=$!

cleanup() {
    echo "Stopping services..."
    kill "$APP_PID" 2>/dev/null || true
    kill "$TUNNEL_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

wait "$APP_PID"
