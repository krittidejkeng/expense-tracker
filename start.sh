#!/bin/zsh
# Start Money Tracker so it's reachable from your other devices (via Tailscale).
# --host 0.0.0.0 = listen on all interfaces, not just this Mac.
cd "$(dirname "$0")"
exec venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
