#!/usr/bin/env bash
# =============================================================================
# supabase-health.sh — Start Supabase local stack & verify PostgreSQL health
# =============================================================================
# Usage:  chmod +x supabase-health.sh && ./supabase-health.sh
# Prerequisites: docker must be working (run fix-docker-wsl.sh first)
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

section() { echo -e "\n${CYAN}══════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}══════════════════════════════════════════════════${NC}"; }
ok()      { echo -e "  ${GREEN}✔ $1${NC}"; }
warn()    { echo -e "  ${YELLOW}⚠ $1${NC}"; }
fail()    { echo -e "  ${RED}✘ $1${NC}"; }

# ─────────────────────────────────────────────────────────────────────────────
# Pre-flight: Verify Docker is working
# ─────────────────────────────────────────────────────────────────────────────
section "Pre-flight: Docker check"

if ! command -v docker &>/dev/null; then
    fail "docker command not found — run fix-docker-wsl.sh first"
    exit 1
fi

if ! docker info &>/dev/null 2>&1; then
    fail "Docker daemon is not responding"
    echo -e "  ${YELLOW}Possible causes:${NC}"
    echo "    1. Docker Desktop is not running on Windows"
    echo "    2. WSL integration is not enabled for this distro"
    echo "    3. Docker socket is not accessible"
    exit 1
fi
ok "Docker daemon is running and responsive"

# ─────────────────────────────────────────────────────────────────────────────
# Pre-flight: Verify Supabase CLI
# ─────────────────────────────────────────────────────────────────────────────
section "Pre-flight: Supabase CLI check"

if ! command -v supabase &>/dev/null; then
    fail "supabase CLI not found"
    echo -e "  ${YELLOW}Install with:${NC}"
    echo "    brew install supabase/tap/supabase"
    echo "    or: npm install -g supabase"
    echo "    or: go install github.com/supabase/cli/v2@latest"
    exit 1
fi

SUPABASE_VERSION=$(supabase --version 2>/dev/null || echo "unknown")
ok "Supabase CLI found: ${SUPABASE_VERSION}"

# ─────────────────────────────────────────────────────────────────────────────
# Navigate to project directory
# ─────────────────────────────────────────────────────────────────────────────
section "Navigating to project directory"

PROJECT_DIR="${HOME}/MyPal_Final"

if [ ! -d "$PROJECT_DIR" ]; then
    warn "${PROJECT_DIR} not found, checking alternatives..."
    # Try the WSL mount of the Windows path
    ALT_DIRS=(
        "/mnt/g/MyPal/MyPal"
        "${HOME}/MyPal"
        "$(pwd)"
    )
    for alt in "${ALT_DIRS[@]}"; do
        if [ -d "$alt/supabase" ]; then
            PROJECT_DIR="$alt"
            ok "Found supabase project at: ${PROJECT_DIR}"
            break
        fi
    done
fi

if [ ! -d "$PROJECT_DIR/supabase" ]; then
    fail "No supabase directory found in ${PROJECT_DIR}"
    echo -e "  ${YELLOW}Make sure you have run 'supabase init' in your project${NC}"
    exit 1
fi

cd "$PROJECT_DIR"
ok "Working directory: $(pwd)"

# ─────────────────────────────────────────────────────────────────────────────
# Clean up stale containers (safe — only targets supabase containers)
# ─────────────────────────────────────────────────────────────────────────────
section "Checking for stale Supabase containers"

STALE_CONTAINERS=$(docker ps -a --filter "name=supabase_" --filter "status=exited" --format "{{.Names}}" 2>/dev/null || true)
if [ -n "$STALE_CONTAINERS" ]; then
    warn "Found stale Supabase containers — cleaning up:"
    echo "$STALE_CONTAINERS" | while read -r c; do
        echo -e "    Removing: ${YELLOW}${c}${NC}"
        docker rm "$c" 2>/dev/null || true
    done
    ok "Stale containers removed"
else
    ok "No stale Supabase containers found"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Start Supabase
# ─────────────────────────────────────────────────────────────────────────────
section "Starting Supabase local stack"

echo -e "  ${YELLOW}This may take a few minutes on first run (pulling images)...${NC}"
echo ""

supabase start 2>&1 | while IFS= read -r line; do
    echo -e "  ${line}"
done

SUPABASE_EXIT=${PIPESTATUS[0]}
if [ "$SUPABASE_EXIT" -ne 0 ]; then
    fail "supabase start failed with exit code ${SUPABASE_EXIT}"
    echo -e "  ${YELLOW}Try: supabase stop --no-backup && supabase start${NC}"
    exit 1
fi

ok "Supabase local stack started successfully"

# ─────────────────────────────────────────────────────────────────────────────
# Verify PostgreSQL container health
# ─────────────────────────────────────────────────────────────────────────────
section "Verifying PostgreSQL container health"

# Find the Supabase Postgres container
PG_CONTAINER=$(docker ps --filter "name=supabase_db" --format "{{.Names}}" 2>/dev/null | head -1)

if [ -z "$PG_CONTAINER" ]; then
    # Try alternative naming patterns
    PG_CONTAINER=$(docker ps --filter "ancestor=supabase/postgres" --format "{{.Names}}" 2>/dev/null | head -1)
fi

if [ -z "$PG_CONTAINER" ]; then
    PG_CONTAINER=$(docker ps --filter "name=db" --format "{{.Names}}" 2>/dev/null | grep -i "supa\|db" | head -1)
fi

if [ -n "$PG_CONTAINER" ]; then
    ok "PostgreSQL container found: ${PG_CONTAINER}"

    # Container status
    PG_STATUS=$(docker inspect --format='{{.State.Status}}' "$PG_CONTAINER" 2>/dev/null)
    PG_HEALTH=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$PG_CONTAINER" 2>/dev/null)
    PG_UPTIME=$(docker inspect --format='{{.State.StartedAt}}' "$PG_CONTAINER" 2>/dev/null)

    echo -e "  Status:      ${GREEN}${PG_STATUS}${NC}"
    echo -e "  Health:      ${GREEN}${PG_HEALTH}${NC}"
    echo -e "  Started at:  ${YELLOW}${PG_UPTIME}${NC}"

    # Try a pg_isready check inside the container
    echo ""
    echo -e "  ${CYAN}Running pg_isready inside container...${NC}"
    if docker exec "$PG_CONTAINER" pg_isready -U postgres 2>/dev/null; then
        ok "PostgreSQL is accepting connections"
    else
        warn "pg_isready check failed — Postgres may still be initializing"
        echo -e "  ${YELLOW}Wait 10 seconds and try: docker exec ${PG_CONTAINER} pg_isready -U postgres${NC}"
    fi

    # Show port mapping
    echo ""
    PG_PORTS=$(docker port "$PG_CONTAINER" 2>/dev/null || echo "unknown")
    echo -e "  ${CYAN}Port mappings:${NC}"
    echo "$PG_PORTS" | while read -r p; do
        echo -e "    ${YELLOW}${p}${NC}"
    done
else
    fail "Could not find PostgreSQL container"
    echo -e "  ${YELLOW}All running containers:${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}" 2>/dev/null || true
fi

# ─────────────────────────────────────────────────────────────────────────────
# Show all Supabase services
# ─────────────────────────────────────────────────────────────────────────────
section "All Supabase containers"

docker ps --filter "name=supabase" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || \
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null

# ─────────────────────────────────────────────────────────────────────────────
# Show Supabase status
# ─────────────────────────────────────────────────────────────────────────────
section "Supabase service URLs"

supabase status 2>/dev/null || warn "Could not get supabase status"

echo ""
section "Done — Supabase local stack is running"
echo -e "  ${GREEN}You can now connect to your local Supabase instance.${NC}"
echo -e "  ${YELLOW}Local DB:  postgresql://postgres:postgres@127.0.0.1:54322/postgres${NC}"
echo -e "  ${YELLOW}Studio:    http://127.0.0.1:54323${NC}"
echo ""
