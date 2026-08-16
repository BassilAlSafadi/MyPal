# MyPal Backend Startup Script (PowerShell 5.1 compatible)
# Auto-registered in Windows Startup folder — runs at every login.
# Starts all six backend services and opens a cloudflared tunnel per service.
#
# NOTE ON PUBLIC URLS
# Before the split there was one gateway behind one tunnel, and that single URL
# was registered with the Supabase edge-function proxy so Vercel never needed a
# redeploy. Six services need six public URLs, which the one-URL proxy contract
# cannot express, so this script now prints the URLs and writes them to
# $env:TEMP\mypal-tunnel-urls.json instead of registering them. Point the SPA at
# them via the VITE_*_URL build vars, or reinstate a reverse proxy that fans one
# hostname out across the six.

$ROOT = $PSScriptRoot
Set-Location $ROOT

# ── Resolve tool paths ───────────────────────────────────────────────────────
$DOTNET      = (Get-Command dotnet -ErrorAction SilentlyContinue).Source
$GO          = (Get-Command go     -ErrorAction SilentlyContinue).Source
$CLOUDFLARED = "$env:TEMP\cloudflared.exe"

# ── Load .env ────────────────────────────────────────────────────────────────
Get-Content (Join-Path $ROOT ".env") | ForEach-Object {
    if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
        $k = $matches[1].Trim(); $v = $matches[2].Trim().Trim('"')
        [System.Environment]::SetEnvironmentVariable($k, $v, 'Process')
    }
}

$JWT   = $env:JWT_SECRET
$TOKEN = $env:INTERNAL_SERVICE_TOKEN
$CORS  = if ($env:CORS_ALLOWED_ORIGINS) { $env:CORS_ALLOWED_ORIGINS } else { "http://localhost:5173" }

Write-Host "=== MyPal Backend Startup ===" -ForegroundColor Cyan

# ── 1. Free ports ────────────────────────────────────────────────────────────
$PORTS = @(5000, 5001, 5002, 5003, 5004, 5005)
Write-Host "Freeing ports $($PORTS -join ' ')..." -ForegroundColor Yellow
$PORTS | ForEach-Object {
    try {
        $p = (Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue).OwningProcess | Select-Object -First 1
        if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Write-Host "  Freed :$_" }
    } catch {}
}
Start-Sleep -Seconds 2

# Settings every service shares.
$env:JWT_SECRET             = $JWT
$env:INTERNAL_SERVICE_TOKEN = $TOKEN
$env:CORS_ALLOWED_ORIGINS   = $CORS
$env:REDIS_URL              = $env:REDIS_URL
$env:ASPNETCORE_ENVIRONMENT = "Production"

# Where each service can reach the others.
$env:AUTH_SERVICE_URL      = "http://localhost:5000"
$env:MESSAGING_SERVICE_URL = "http://localhost:5001"
$env:LISTINGS_SERVICE_URL  = "http://localhost:5002"
$env:AI_SERVICE_URL        = "http://localhost:5003"
$env:ORDERS_SERVICE_URL    = "http://localhost:5004"
$env:PAYMENTS_SERVICE_URL  = "http://localhost:5005"

$procs = @{}

function Start-CSharpService($name, $project, $port) {
    Write-Host "Starting $name :$port..." -ForegroundColor Green
    $env:PORT = "$port"
    $dir = Join-Path $ROOT "Backend\CSharp\$project"
    $p = Start-Process $DOTNET `
        -ArgumentList "run --no-build --project $project.csproj" `
        -WorkingDirectory $dir -WindowStyle Hidden -PassThru
    Write-Host "  $name PID: $($p.Id)"
    return $p
}

function Start-GoService($name, $cmd, $port) {
    Write-Host "Starting $name :$port..." -ForegroundColor Green
    $env:PORT = "$port"
    $dir = Join-Path $ROOT "Backend\Go"
    $p = Start-Process $GO `
        -ArgumentList "run ./cmd/$cmd" `
        -WorkingDirectory $dir -WindowStyle Hidden -PassThru
    Write-Host "  $name PID: $($p.Id)"
    return $p
}

# ── 2. Auth (C#) — started first; the others resolve profiles against it ─────
$env:FRONTEND_URL = if ($env:FRONTEND_URL) { $env:FRONTEND_URL } else { "http://localhost:5173" }
$procs["auth"] = Start-CSharpService "Auth" "MyPal.Auth" 5000

Write-Host "Waiting for Auth..." -ForegroundColor Yellow
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
    try {
        Invoke-WebRequest "http://localhost:5000/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null
        $ok = $true; break
    } catch {}
    Start-Sleep -Seconds 2
}
Write-Host "  Auth $(if ($ok) {'ready'} else {'timed out — continuing anyway'})"

# ── 3. Listings (C#) ─────────────────────────────────────────────────────────
$procs["listings"] = Start-CSharpService "Listings" "MyPal.Listings" 5002

# ── 4. Orders (C#) — owns the mypal_orders schema, so it runs before Payments ─
$procs["orders"] = Start-CSharpService "Orders" "MyPal.Orders" 5004
Start-Sleep -Seconds 3

# ── 5. Payments (C#) ─────────────────────────────────────────────────────────
$procs["payments"] = Start-CSharpService "Payments" "MyPal.Payments" 5005

# ── 6. AI (Go) ───────────────────────────────────────────────────────────────
$procs["ai"] = Start-GoService "AI" "ai" 5003
Start-Sleep -Seconds 3

# ── 7. Messaging (Go) — asks the AI service for chat replies ─────────────────
$procs["messaging"] = Start-GoService "Messaging" "messaging" 5001

Start-Sleep -Seconds 5

# ── 8. Health check ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Health checks:" -ForegroundColor Cyan
$SERVICE_PORTS = [ordered]@{
    auth = 5000; messaging = 5001; listings = 5002; ai = 5003; orders = 5004; payments = 5005
}
foreach ($svc in $SERVICE_PORTS.Keys) {
    $port = $SERVICE_PORTS[$svc]
    try {
        Invoke-WebRequest "http://localhost:$port/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop | Out-Null
        Write-Host ("  {0,-10} :{1}  ok" -f $svc, $port) -ForegroundColor Green
    } catch {
        Write-Host ("  {0,-10} :{1}  not responding" -f $svc, $port) -ForegroundColor Red
    }
}

# ── 9. cloudflared tunnels — one per service ─────────────────────────────────
if (-not (Test-Path $CLOUDFLARED)) {
    Write-Host ""
    Write-Host "cloudflared not found at $CLOUDFLARED — skipping tunnels (services are still up on localhost)." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Starting cloudflared tunnels..." -ForegroundColor Green
$tunnelUrls = [ordered]@{}

foreach ($svc in $SERVICE_PORTS.Keys) {
    $port = $SERVICE_PORTS[$svc]
    $log  = "$env:TEMP\mypal-tunnel-$svc.log"
    Remove-Item $log -ErrorAction SilentlyContinue

    $cf = Start-Process $CLOUDFLARED `
        -ArgumentList "tunnel --url http://localhost:$port --no-autoupdate" `
        -WindowStyle Hidden -PassThru -RedirectStandardError $log

    $url = $null
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 2
        if (Test-Path $log) {
            $content = Get-Content $log -Raw -ErrorAction SilentlyContinue
            if ($content -match 'https://[a-z0-9\-]+\.trycloudflare\.com') { $url = $matches[0].Trim(); break }
        }
    }

    if ($url) {
        $tunnelUrls[$svc] = $url
        Write-Host ("  {0,-10} {1}" -f $svc, $url) -ForegroundColor Cyan
    } else {
        Write-Host ("  {0,-10} tunnel URL not detected (PID {1})" -f $svc, $cf.Id) -ForegroundColor Red
    }
}

$urlFile = "$env:TEMP\mypal-tunnel-urls.json"
[System.IO.File]::WriteAllText($urlFile, ($tunnelUrls | ConvertTo-Json), [System.Text.Encoding]::ASCII)

Write-Host ""
Write-Host "=============================" -ForegroundColor Cyan
Write-Host " MyPal backend is up" -ForegroundColor Green
Write-Host " Tunnel URLs written to: $urlFile" -ForegroundColor Green
Write-Host ""
Write-Host " Set these on the frontend build:" -ForegroundColor Yellow
foreach ($svc in $tunnelUrls.Keys) {
    Write-Host ("   VITE_{0}_URL={1}" -f $svc.ToUpper(), $tunnelUrls[$svc])
}
Write-Host "=============================" -ForegroundColor Cyan
