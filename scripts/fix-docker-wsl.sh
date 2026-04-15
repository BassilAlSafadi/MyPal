#!/usr/bin/env bash
# =============================================================================
# fix-docker-wsl.sh — Diagnose & repair Docker Desktop ↔ WSL 2 integration
# =============================================================================
# Usage:  chmod +x fix-docker-wsl.sh && ./fix-docker-wsl.sh
# Constraint: No reinstallation. Focuses on path linking & socket connectivity.
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

section() { echo -e "\n${CYAN}══════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}══════════════════════════════════════════════════${NC}"; }
ok()      { echo -e "  ${GREEN}✔ $1${NC}"; }
warn()    { echo -e "  ${YELLOW}⚠ $1${NC}"; }
fail()    { echo -e "  ${RED}✘ $1${NC}"; }

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Check if /usr/bin/docker symlink exists
# ─────────────────────────────────────────────────────────────────────────────
section "Step 1: Checking /usr/bin/docker symbolic link"

if [ -L /usr/bin/docker ]; then
    TARGET=$(readlink -f /usr/bin/docker 2>/dev/null || readlink /usr/bin/docker)
    ok "/usr/bin/docker is a symlink → ${TARGET}"
    if [ -x "$TARGET" ]; then
        ok "Target binary is executable"
    else
        fail "Target binary is NOT executable or missing"
    fi
elif [ -f /usr/bin/docker ]; then
    ok "/usr/bin/docker exists as a regular file"
    if [ -x /usr/bin/docker ]; then
        ok "Binary is executable"
    else
        fail "Binary exists but is NOT executable"
    fi
else
    fail "/usr/bin/docker does NOT exist"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Locate Docker Desktop WSL integration binaries
# ─────────────────────────────────────────────────────────────────────────────
section "Step 2: Locating Docker Desktop WSL integration paths"

# Docker Desktop injects its CLI tools into these paths in WSL distros
DOCKER_DESKTOP_PATHS=(
    "/mnt/c/Program Files/Docker/Docker/resources/bin"
    "/mnt/c/ProgramData/DockerDesktop/version-bin"
    "$HOME/.docker/cli-plugins"
)

# Docker Desktop WSL integration copies binaries here
DOCKER_WSL_DISTRO_PATH="/usr/local/bin"

FOUND_DOCKER_EXE=""

for dp in "${DOCKER_DESKTOP_PATHS[@]}"; do
    if [ -d "$dp" ]; then
        ok "Found Docker path: ${dp}"
        if [ -f "$dp/docker" ] || [ -f "$dp/docker.exe" ]; then
            FOUND_DOCKER_EXE="$dp"
            ok "  → docker binary found in this path"
        else
            warn "  → directory exists but no docker binary inside"
        fi
    else
        warn "Path not found: ${dp}"
    fi
done

# Also check if Docker Desktop pushed integration to /usr/local/bin
if [ -x "${DOCKER_WSL_DISTRO_PATH}/docker" ]; then
    ok "/usr/local/bin/docker exists and is executable"
    FOUND_DOCKER_EXE="${DOCKER_WSL_DISTRO_PATH}"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Verify Docker Desktop WSL integration settings
# ─────────────────────────────────────────────────────────────────────────────
section "Step 3: Checking Docker Desktop WSL integration config"

DD_SETTINGS="/mnt/c/Users/$(cmd.exe /C "echo %USERNAME%" 2>/dev/null | tr -d '\r' || echo 'Basil')/AppData/Roaming/Docker/settings-store.json"
DD_SETTINGS_LEGACY="/mnt/c/Users/$(cmd.exe /C "echo %USERNAME%" 2>/dev/null | tr -d '\r' || echo 'Basil')/AppData/Roaming/Docker/settings.json"

if [ -f "$DD_SETTINGS" ]; then
    ok "Found Docker Desktop settings: ${DD_SETTINGS}"
    if command -v jq &>/dev/null; then
        WSL_ENABLED=$(jq -r '.wslEngineEnabled // .UseWSL2BasedEngine // "unknown"' "$DD_SETTINGS" 2>/dev/null || echo "parse_error")
        echo -e "  WSL 2 engine enabled: ${YELLOW}${WSL_ENABLED}${NC}"
        WSL_DISTROS=$(jq -r '.wslIntegrationDistros // empty' "$DD_SETTINGS" 2>/dev/null || echo "")
        if [ -n "$WSL_DISTROS" ]; then
            echo -e "  WSL integration distros: ${YELLOW}${WSL_DISTROS}${NC}"
        fi
    else
        warn "jq not installed — printing raw settings excerpts"
        grep -iE "wsl|integration|engine" "$DD_SETTINGS" 2>/dev/null || warn "No WSL-related keys found"
    fi
elif [ -f "$DD_SETTINGS_LEGACY" ]; then
    ok "Found Docker Desktop settings (legacy): ${DD_SETTINGS_LEGACY}"
    grep -iE "wsl|integration|engine" "$DD_SETTINGS_LEGACY" 2>/dev/null || warn "No WSL-related keys found"
else
    warn "Could not locate Docker Desktop settings file"
    warn "Ensure Docker Desktop → Settings → Resources → WSL Integration → Ubuntu is ON"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Check Docker socket
# ─────────────────────────────────────────────────────────────────────────────
section "Step 4: Checking Docker socket"

DOCKER_SOCK="/var/run/docker.sock"
if [ -S "$DOCKER_SOCK" ]; then
    ok "Docker socket exists: ${DOCKER_SOCK}"
    if [ -w "$DOCKER_SOCK" ]; then
        ok "Socket is writable by current user"
    else
        fail "Socket exists but is NOT writable by $(whoami)"
        warn "Fix: sudo usermod -aG docker $(whoami) && newgrp docker"
    fi
else
    fail "Docker socket NOT found at ${DOCKER_SOCK}"
    # Check alternative socket locations
    ALT_SOCK="$HOME/.docker/run/docker.sock"
    if [ -S "$ALT_SOCK" ]; then
        ok "Found alternative socket: ${ALT_SOCK}"
        warn "You may need: export DOCKER_HOST=unix://${ALT_SOCK}"
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Check PATH for docker
# ─────────────────────────────────────────────────────────────────────────────
section "Step 5: Checking PATH resolution"

WHICH_DOCKER=$(which docker 2>/dev/null || echo "NOT_FOUND")
if [ "$WHICH_DOCKER" != "NOT_FOUND" ]; then
    ok "docker found in PATH: ${WHICH_DOCKER}"
else
    fail "docker is NOT in PATH"
    echo -e "  Current PATH:"
    echo "$PATH" | tr ':' '\n' | head -20 | while read -r p; do
        echo -e "    ${YELLOW}${p}${NC}"
    done
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — Automatic repair
# ─────────────────────────────────────────────────────────────────────────────
section "Step 6: Attempting automatic repair"

repair_needed=false

# 6a. If docker not in PATH and we found a Docker Desktop binary, create symlink
if [ "$WHICH_DOCKER" = "NOT_FOUND" ] && [ -n "$FOUND_DOCKER_EXE" ]; then
    repair_needed=true
    echo -e "  ${YELLOW}Creating symlinks from ${FOUND_DOCKER_EXE} → /usr/local/bin/${NC}"

    for binary in docker docker-compose docker-credential-desktop; do
        SRC=""
        if [ -f "${FOUND_DOCKER_EXE}/${binary}" ]; then
            SRC="${FOUND_DOCKER_EXE}/${binary}"
        elif [ -f "${FOUND_DOCKER_EXE}/${binary}.exe" ]; then
            SRC="${FOUND_DOCKER_EXE}/${binary}.exe"
        fi

        if [ -n "$SRC" ]; then
            sudo ln -sf "$SRC" "/usr/local/bin/${binary}" 2>/dev/null && \
                ok "Linked ${binary} → ${SRC}" || \
                fail "Failed to link ${binary}"
        fi
    done
fi

# 6b. If no Docker binary was found anywhere, create a passthrough wrapper
if [ "$WHICH_DOCKER" = "NOT_FOUND" ] && [ -z "$FOUND_DOCKER_EXE" ]; then
    repair_needed=true
    echo -e "  ${YELLOW}No Docker binary found. Creating Windows passthrough wrapper...${NC}"

    WRAPPER_SCRIPT="/usr/local/bin/docker"
    sudo tee "$WRAPPER_SCRIPT" > /dev/null << 'WRAPPER'
#!/usr/bin/env bash
# Passthrough wrapper: calls docker.exe on the Windows side via WSL interop
/mnt/c/Program\ Files/Docker/Docker/resources/bin/docker.exe "$@"
WRAPPER
    sudo chmod +x "$WRAPPER_SCRIPT"

    if [ -x "$WRAPPER_SCRIPT" ]; then
        ok "Created passthrough wrapper at ${WRAPPER_SCRIPT}"
    else
        fail "Failed to create wrapper"
    fi
fi

# 6c. Ensure /usr/local/bin is in PATH
if ! echo "$PATH" | grep -q "/usr/local/bin"; then
    repair_needed=true
    echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.bashrc
    export PATH="/usr/local/bin:$PATH"
    ok "Added /usr/local/bin to PATH in ~/.bashrc"
fi

if [ "$repair_needed" = false ]; then
    ok "No repairs needed — docker appears to be correctly configured"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — Final verification
# ─────────────────────────────────────────────────────────────────────────────
section "Step 7: Final verification"

if command -v docker &>/dev/null; then
    ok "docker command is now available"
    echo ""
    echo -e "  ${CYAN}Docker version:${NC}"
    docker version --format '  Client: {{.Client.Version}}' 2>/dev/null || warn "Could not get client version"
    docker version --format '  Server: {{.Server.Version}}' 2>/dev/null || warn "Could not get server version (daemon may not be running)"
    echo ""
    echo -e "  ${CYAN}Docker info (abridged):${NC}"
    docker info --format '  OS: {{.OperatingSystem}}' 2>/dev/null || true
    docker info --format '  Runtime: {{.DefaultRuntime}}' 2>/dev/null || true
    echo ""
    echo -e "  ${CYAN}Running containers:${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || warn "Could not list containers"
else
    fail "docker command is still NOT available after repair"
    echo ""
    echo -e "  ${RED}Manual steps required:${NC}"
    echo -e "  1. Open Docker Desktop on Windows"
    echo -e "  2. Go to Settings → Resources → WSL Integration"
    echo -e "  3. Enable integration for your Ubuntu distro"
    echo -e "  4. Click 'Apply & Restart'"
    echo -e "  5. Close and reopen your WSL terminal"
    echo -e "  6. Re-run this script"
fi

echo ""
section "Done"
