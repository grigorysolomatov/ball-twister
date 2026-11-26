#!/usr/bin/env bash
# Serve the game locally. Usage: ./launch.sh [port]
cd "$(dirname "$0")" || exit 1
PORT="${1:-8185}"
echo "Ball Twister: http://127.0.0.1:${PORT}/"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
