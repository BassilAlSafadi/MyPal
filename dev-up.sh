#!/usr/bin/env bash
# Starts the full MyPal stack for local end-to-end testing:
#   ProdBERT (local embedding service, Node/@xenova-transformers),
#   4 C# services (auth, listings, orders, payments), 2 Go services (ai, messaging),
#   then the Vite frontend in the foreground.
#
# Postgres, MongoDB and Redis are all cloud-hosted (Supabase, Atlas, Upstash) per
# .env, so nothing local needs to be started for those.
#
# NATS is an optional dependency the orders service already degrades
# gracefully without (the outbox dispatcher is skipped), so this script does
# not start it.
#
# Usage: ./dev-up.sh   (or: bash dev-up.sh)
# Stop everything with Ctrl+C.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"

PIDS=()

kill_port() {
  local port=$1
  local pids
  pids=$(netstat -ano 2>/dev/null | grep -E "LISTENING" | awk -v p=":$port" '$2 ~ p"$" {print $NF}' | sort -u)
  for pid in $pids; do
    MSYS_NO_PATHCONV=1 taskkill /PID "$pid" /F >/dev/null 2>&1
  done
}

cleanup() {
  echo ""
  echo "Shutting down..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null
  done
  sleep 1
  for port in 5000 5001 5002 5003 5004 5005 8001; do
    kill_port "$port"
  done
  echo "All services stopped."
}
trap cleanup EXIT INT TERM

echo "=== MyPal full-stack startup ==="

if [ ! -f .env ]; then
  echo "Missing .env at repo root — copy .env.example and fill it in first." >&2
  exit 1
fi

# Deliberately not `source .env`: several values (the *_POSTGRES_URL strings)
# contain unquoted ';' and spaces ("SSL Mode=Require;Trust Server Certificate=true"),
# which bash would parse as command separators/word breaks and mangle. Read each
# line and export the raw value instead, so it's treated as a literal string.
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  [[ -z "$line" ]] && continue
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    key="${BASH_REMATCH[1]}"
    val="${BASH_REMATCH[2]}"
    if [[ "$val" == \"*\" && "$val" == *\" ]]; then
      val="${val:1:-1}"
    fi
    export "$key=$val"
  fi
done < .env

echo ""
echo "Freeing ports 5000-5005, 5173 and 8001..."
for port in 5000 5001 5002 5003 5004 5005 5173 8001; do
  kill_port "$port"
done
sleep 1

echo ""
if [ ! -d "$ROOT/Backend/ProdBERT/node_modules" ]; then
  echo "Installing ProdBERT dependencies (first run — downloads the embedding model too)..."
  (cd "$ROOT/Backend/ProdBERT" && npm install)
fi
echo "Starting ProdBERT (embedding service) :8001..."
(
  cd "$ROOT/Backend/ProdBERT"
  PRODBERT_PORT=8001 node server.mjs
) > "$LOG_DIR/prodbert.log" 2>&1 &
PIDS+=($!)

ok=false
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:8001/health" >/dev/null 2>&1; then ok=true; break; fi
  sleep 2
done
if $ok; then
  echo "  prodbert (:8001)  ok"
else
  echo "  prodbert (:8001)  NOT responding — check $LOG_DIR/prodbert.log (internal search will run degraded without it)"
fi

echo ""
echo "Building backend (C#)..."
if ! dotnet build "$ROOT/Backend/CSharp/MyPal.Backend.sln" -v quiet -nologo > "$LOG_DIR/dotnet-build.log" 2>&1; then
  echo "dotnet build failed — see $LOG_DIR/dotnet-build.log" >&2
  exit 1
fi
echo "  build ok"

start_csharp() {
  local name=$1 project=$2 port=$3
  echo "Starting $name :$port..."
  (
    cd "$ROOT/Backend/CSharp/$project"
    PORT=$port ASPNETCORE_ENVIRONMENT=Production dotnet run --no-build --project "$project.csproj"
  ) > "$LOG_DIR/$name.log" 2>&1 &
  PIDS+=($!)
}

start_go() {
  local name=$1 cmd=$2 port=$3
  echo "Starting $name :$port..."
  (
    cd "$ROOT/Backend/Go"
    PORT=$port go run "./cmd/$cmd"
  ) > "$LOG_DIR/$name.log" 2>&1 &
  PIDS+=($!)
}

export AUTH_SERVICE_URL="http://localhost:5000"
export MESSAGING_SERVICE_URL="http://localhost:5001"
export LISTINGS_SERVICE_URL="http://localhost:5002"
export AI_SERVICE_URL="http://localhost:5003"
export ORDERS_SERVICE_URL="http://localhost:5004"
export PAYMENTS_SERVICE_URL="http://localhost:5005"
export FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"

echo ""
echo "Starting backend services..."
# Auth first — the others resolve profiles against it.
start_csharp auth     MyPal.Auth     5000
start_csharp listings MyPal.Listings 5002
start_csharp orders   MyPal.Orders   5004
start_csharp payments MyPal.Payments 5005
start_go     ai        ai            5003
start_go     messaging messaging     5001

echo ""
echo "Waiting for services to become healthy..."
declare -A PORTS=([auth]=5000 [messaging]=5001 [listings]=5002 [ai]=5003 [orders]=5004 [payments]=5005)
all_ok=true
for name in auth listings orders payments ai messaging; do
  port=${PORTS[$name]}
  ok=false
  for _ in $(seq 1 30); do
    if curl -sf "http://localhost:$port/health" >/dev/null 2>&1; then
      ok=true
      break
    fi
    sleep 2
  done
  if $ok; then
    echo "  $name (:$port)  ok"
  else
    echo "  $name (:$port)  NOT responding — check $LOG_DIR/$name.log"
    all_ok=false
  fi
done

if [ "$all_ok" = false ]; then
  echo ""
  echo "Some backend services did not come up. Fix those before relying on the frontend."
fi

echo ""
if [ ! -d "$ROOT/Frontend/node_modules" ]; then
  echo "Installing frontend dependencies (first run)..."
  (cd "$ROOT/Frontend" && npm install)
fi

echo ""
echo "======================================================"
echo " MyPal is up: http://localhost:5173"
echo " Backend logs: $LOG_DIR/"
echo " Press Ctrl+C to stop everything."
echo "======================================================"
echo ""

cd "$ROOT/Frontend"
npm run dev
