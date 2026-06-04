#!/bin/sh
# Launches the C# Main API on an internal port, then the Go gateway on the
# public port. The gateway proxies to C# over localhost so the hop is never
# subject to Hugging Face's Space-to-Space rate limit.
set -e

CSHARP_PORT=5000
PUBLIC_PORT="${PORT:-7860}"

echo "[start] launching C# API on :${CSHARP_PORT}"
# PORT here is read only by this C# subprocess (it binds 0.0.0.0:$PORT).
PORT="${CSHARP_PORT}" dotnet /app/csharp/MyPal.API.dll &
CSHARP_PID=$!

echo "[start] waiting for C# API to become ready..."
i=0
while [ "$i" -lt 90 ]; do
  if curl -sf "http://localhost:${CSHARP_PORT}/" >/dev/null 2>&1; then
    echo "[start] C# API is ready"
    break
  fi
  if ! kill -0 "$CSHARP_PID" 2>/dev/null; then
    echo "[start] FATAL: C# API exited during startup"
    exit 1
  fi
  i=$((i + 1))
  sleep 1
done

echo "[start] launching gateway on :${PUBLIC_PORT} (C# upstream = localhost:${CSHARP_PORT})"
export GO_GATEWAY_PORT="${PUBLIC_PORT}"
export CSHARP_MAIN_API_URL="http://localhost:${CSHARP_PORT}"
exec /app/gateway
