# MyPal Backend Startup Script (PowerShell 5.1 compatible)
# Auto-registered in Windows Startup folder — runs at every login.
# Starts all backend services, creates a cloudflared tunnel, and
# automatically updates Vercel so the live site always points at the
# fresh tunnel URL. No manual steps needed after a reboot.

$ROOT = $PSScriptRoot
Set-Location $ROOT

# ── Resolve tool paths ───────────────────────────────────────────────────────
$DOTNET      = (Get-Command dotnet      -ErrorAction SilentlyContinue).Source
$NODE        = (Get-Command node        -ErrorAction SilentlyContinue).Source
$NPM         = (Get-Command npm         -ErrorAction SilentlyContinue).Source
$VERCEL      = Join-Path (Split-Path $NPM) "vercel.cmd"
if (-not (Test-Path $VERCEL)) { $VERCEL = Join-Path (Split-Path $NPM) "vercel" }
$CLOUDFLARED = "$env:TEMP\cloudflared.exe"

# ── Load .env ────────────────────────────────────────────────────────────────
Get-Content (Join-Path $ROOT ".env") | ForEach-Object {
    if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
        $k = $matches[1].Trim(); $v = $matches[2].Trim().Trim('"')
        [System.Environment]::SetEnvironmentVariable($k, $v, 'Process')
    }
}

$POSTGRES_URL  = $env:POSTGRES_URL
$JWT           = $env:JWT_SECRET
$TOKEN         = $env:INTERNAL_SERVICE_TOKEN
$POSTGRES_SESS = $env:POSTGRES_SESSION_URL

Write-Host "=== MyPal Backend Startup ===" -ForegroundColor Cyan

# ── 1. Free ports ────────────────────────────────────────────────────────────
Write-Host "Freeing ports 5000 5001 5003 8081..." -ForegroundColor Yellow
@(5000,5001,5003,8081) | ForEach-Object {
    try {
        $p = (Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue).OwningProcess | Select-Object -First 1
        if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Write-Host "  Freed :$_" }
    } catch {}
}
Start-Sleep -Seconds 2

# ── Helper: set env, start hidden process ────────────────────────────────────
function StartHidden($exe, $args, $dir, $envHash) {
    foreach ($kv in $envHash.GetEnumerator()) {
        [System.Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, 'Process')
    }
    $p = Start-Process $exe -ArgumentList $args -WorkingDirectory $dir -WindowStyle Hidden -PassThru
    return $p
}

# ── 2. C# API ────────────────────────────────────────────────────────────────
Write-Host "Starting C# API :5000..." -ForegroundColor Green
$env:ASPNETCORE_ENVIRONMENT = "Production"
$env:POSTGRES_URL           = $POSTGRES_URL
$env:POSTGRES_SESSION_URL   = $POSTGRES_SESS
$env:JWT_SECRET             = $JWT
$env:FRONTEND_URL           = "https://mypal-eta.vercel.app"
$csharpDir = Join-Path $ROOT "Backend\CSharp\MyPal.API"
$cs = Start-Process $DOTNET -ArgumentList "run --no-build --project MyPal.API.csproj --launch-profile http" `
    -WorkingDirectory $csharpDir -WindowStyle Hidden -PassThru
Write-Host "  C# PID: $($cs.Id)"

# ── 3. Node Orchestrator ─────────────────────────────────────────────────────
Write-Host "Starting Node Orchestrator :5003..." -ForegroundColor Green
$env:PORT                   = "5003"
$env:NODE_ORCHESTRATOR_PORT = "5003"
$env:GROQ_API_KEY           = $env:GROQ_API_KEY
$env:TAVILY_API_KEY         = $env:TAVILY_API_KEY
$env:GEMINI_API_KEY         = $env:GEMINI_API_KEY
$env:COHERE_API_KEY         = $env:COHERE_API_KEY
$nodeDir = Join-Path $ROOT "Backend\Node"
$nd = Start-Process $NODE -ArgumentList "index.js" `
    -WorkingDirectory $nodeDir -WindowStyle Hidden -PassThru
Write-Host "  Node PID: $($nd.Id)"

# ── 4. Go Support ────────────────────────────────────────────────────────────
Write-Host "Starting Go Support :5001..." -ForegroundColor Green
$env:GO_SERVER_PORT = "5001"
$env:API_KEY        = $TOKEN
$supportBin = Join-Path $ROOT "Backend\Go\support"
if (Test-Path $supportBin) {
    $gs = Start-Process $supportBin -WorkingDirectory (Join-Path $ROOT "Backend\Go") -WindowStyle Hidden -PassThru
    Write-Host "  Support PID: $($gs.Id)"
}

# ── 5. Wait for C# ──────────────────────────────────────────────────────────
Write-Host "Waiting for C# API..." -ForegroundColor Yellow
$ok = $false
for ($i=0; $i -lt 40; $i++) {
    try { Invoke-WebRequest "http://localhost:5000/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null; $ok=$true; break }
    catch {}; Start-Sleep -Seconds 2
}
Write-Host "  C# $(if ($ok) {'ready'} else {'timed out — continuing anyway'})"

# ── 6. Go Gateway ────────────────────────────────────────────────────────────
Write-Host "Starting Go Gateway :8081..." -ForegroundColor Green
$env:INTERNAL_SERVICE_TOKEN = $TOKEN
$env:JWT_SECRET             = $JWT
$env:POSTGRES_URL           = $POSTGRES_URL
$env:GO_GATEWAY_PORT        = "8081"
$env:MESSAGING_ENABLED      = "false"
$env:CSHARP_MAIN_API_URL    = "http://localhost:5000"
$env:GO_SUPPORT_URL         = "http://localhost:5001"
$env:NODE_ORCHESTRATOR_URL  = "http://localhost:5003"
$env:PRODBERT_URL           = "http://localhost:8001"
$env:CORS_ALLOWED_ORIGINS   = "http://localhost:5173,https://mypal-eta.vercel.app"

$gwBin = Join-Path $ROOT "Backend\Go\gateway-new"
if (-not (Test-Path $gwBin)) { $gwBin = Join-Path $ROOT "Backend\Go\gateway-bin" }
$gw = Start-Process $gwBin -WorkingDirectory (Join-Path $ROOT "Backend\Go") -WindowStyle Hidden -PassThru
Write-Host "  Gateway PID: $($gw.Id)"
Start-Sleep -Seconds 5

try {
    $r = Invoke-WebRequest "http://localhost:8081/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "  Gateway: $($r.Content)" -ForegroundColor Green
} catch { Write-Host "  Gateway health check failed: $_" -ForegroundColor Red }

# ── 7. cloudflared tunnel ────────────────────────────────────────────────────
Write-Host "Starting cloudflared tunnel..." -ForegroundColor Green
$tunnelLog = "$env:TEMP\mypal-tunnel.log"
Remove-Item $tunnelLog -ErrorAction SilentlyContinue
$cf = Start-Process $CLOUDFLARED `
    -ArgumentList "tunnel --url http://localhost:8081 --no-autoupdate" `
    -WindowStyle Hidden -PassThru -RedirectStandardError $tunnelLog
Write-Host "  cloudflared PID: $($cf.Id)"

$tunnelUrl = $null
for ($i=0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Path $tunnelLog) {
        $log = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
        if ($log -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
            $tunnelUrl = $matches[0]; break
        }
    }
}

if (-not $tunnelUrl) {
    Write-Host "  Tunnel URL not detected — exiting" -ForegroundColor Red; exit 1
}
# Strip any stray whitespace/BOM — write as ASCII so curl can read it cleanly
$tunnelUrl = $tunnelUrl.Trim()
Write-Host "  Tunnel URL: $tunnelUrl" -ForegroundColor Cyan
[System.IO.File]::WriteAllText("$env:TEMP\mypal-tunnel-url.txt", $tunnelUrl, [System.Text.Encoding]::ASCII)

# ── 8. Register tunnel URL in Supabase (Vercel points there permanently) ─────
# The Supabase gateway-proxy edge function reads this value and proxies all
# traffic — so Vercel never needs redeploying when the tunnel URL changes.
Write-Host "Registering tunnel URL in Supabase..." -ForegroundColor Green
$updateEndpoint = "https://cuwjzieetdyoxhidrhro.supabase.co/functions/v1/update-tunnel"
$updateSecret   = "mypal-tunnel-update-secret-2025"
$body = [System.Text.Encoding]::UTF8.GetBytes("{`"url`":`"$tunnelUrl`"}")
try {
    $resp = Invoke-WebRequest -Uri $updateEndpoint -Method POST `
        -Headers @{ "x-tunnel-secret" = $updateSecret; "Content-Type" = "application/json" } `
        -Body $body -UseBasicParsing -TimeoutSec 15
    Write-Host "  Supabase updated: $($resp.Content)" -ForegroundColor Green
} catch {
    Write-Host "  Supabase update failed: $_ -- site may use stale tunnel URL" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=============================" -ForegroundColor Cyan
Write-Host " MyPal is LIVE!" -ForegroundColor Green
Write-Host " https://mypal-eta.vercel.app" -ForegroundColor Green
Write-Host " Gateway: $tunnelUrl" -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Cyan
