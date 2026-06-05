#!/bin/sh
# Launches C# Main API (HTTP + gRPC), then the Go gateway on the public port.
# The gateway talks to C# via gRPC on localhost:5010 — no HF Space-to-Space hop.
set -e

CSHARP_HTTP_PORT=5000
CSHARP_GRPC_PORT=5010
PUBLIC_PORT="${PORT:-7860}"

echo "[start] launching C# API (HTTP :${CSHARP_HTTP_PORT}, gRPC :${CSHARP_GRPC_PORT})"
PORT="${CSHARP_HTTP_PORT}" GRPC_PORT="${CSHARP_GRPC_PORT}" \
  dotnet /app/csharp/MyPal.API.dll &
CSHARP_PID=$!

echo "[start] waiting for C# HTTP to become ready..."
i=0
while [ "$i" -lt 90 ]; do
  if curl -sf "http://localhost:${CSHARP_HTTP_PORT}/" >/dev/null 2>&1; then
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

echo "[start] launching gateway on :${PUBLIC_PORT}"
export GO_GATEWAY_PORT="${PUBLIC_PORT}"
export CSHARP_MAIN_API_URL="http://localhost:${CSHARP_HTTP_PORT}"
export CSHARP_GRPC_ADDR="localhost:${CSHARP_GRPC_PORT}"
exec /app/gateway
