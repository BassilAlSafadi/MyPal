# Full UAT survivability test matrix (requires PostgreSQL).
# Usage:
#   .\scripts\uat\run-survivability-tests.ps1 -StartDocker

param(
    [switch]$StartDocker
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "load-env.ps1")
. (Join-Path $PSScriptRoot "Invoke-Native.ps1")

if ($StartDocker) {
    Write-Host "==> Ensuring UAT Postgres (docker) is running"
    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
    Invoke-Native { docker compose -f "$repoRoot\deployments\docker-compose.uat-postgres.yml" up -d } -ErrorMessage "Docker Compose Up Failed"
    
    # Wait for health
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        $ok = docker compose -f "$repoRoot\deployments\docker-compose.uat-postgres.yml" ps --format json 2>$null | 
            ConvertFrom-Json | 
            Where-Object { $_.Service -eq "postgres" -and $_.Health -eq "healthy" }
        if ($ok) { break }
        Start-Sleep -Seconds 2
    }
    
    # Force local DSN for tests
    $env:POSTGRES_URL = "Host=127.0.0.1;Database=mypal;Username=postgres;Password=postgres"
    $env:POSTGRES_SESSION_URL = $null
    $env:POSTGRES_TEST_URL = $null
}

if (-not $env:POSTGRES_TEST_URL) {
    if ($env:POSTGRES_URL) {
        $env:POSTGRES_TEST_URL = $env:POSTGRES_URL
    } else {
        Write-Error "POSTGRES_TEST_URL or POSTGRES_URL is required."
    }
}

if ($env:UAT_REQUIRE_DB -ne "1") {
    $env:UAT_REQUIRE_DB = "1"
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

Push-Location "$repoRoot\Backend\Go"
try {
    Write-Host "==> Go build"
    Invoke-Native { go build ./... } -ErrorMessage "Go Build Failed"

    Write-Host "==> UAT matrix (schema, saga, idempotency, reconciliation, poison)"
    Invoke-Native { go test ./internal/gateway/uat/... ./internal/gateway/saga/... ./internal/gateway/middleware/... ./internal/gateway/messaging/... `
        -run "TestUAT_|TestSaga|TestIdempotency|TestCompensation|TestExecuteWithIdempotency|TestPersistGatewayPoison|TestConsumer" `
        -count=1 -v } -ErrorMessage "Go UAT Matrix Tests Failed"
}
finally {
    Pop-Location
}

Write-Host "Integration matrix finished."
