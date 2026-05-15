# One-shot: optional Docker Postgres, load .env, apply migrations, run full UAT test matrix.
param(
    [switch]$StartDocker,
    [switch]$RequireTests
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

. (Join-Path $PSScriptRoot "load-env.ps1")
. (Join-Path $PSScriptRoot "Invoke-Native.ps1")

if ($StartDocker) {
    Write-Host "==> Starting UAT Postgres (docker)"
    docker compose -f "$repoRoot\deployments\docker-compose.uat-postgres.yml" up -d
    $deadline = (Get-Date).AddMinutes(2)
    while ((Get-Date) -lt $deadline) {
        $ok = docker compose -f "$repoRoot\deployments\docker-compose.uat-postgres.yml" ps --format json 2>$null |
            ConvertFrom-Json |
            Where-Object { $_.Service -eq "postgres" -and $_.Health -eq "healthy" }
        if ($ok) { break }
        Start-Sleep -Seconds 2
    }
    if ($StartDocker) {
        $env:POSTGRES_URL = "Host=127.0.0.1;Database=mypal;Username=postgres;Password=postgres"
        $env:POSTGRES_SESSION_URL = $null
        $env:POSTGRES_TEST_URL = $null
    }
}

if (-not $env:POSTGRES_URL -and -not $env:POSTGRES_SESSION_URL) {
    Write-Error "POSTGRES_URL or POSTGRES_SESSION_URL is required. Copy .env.example to .env or pass -StartDocker."
}

if (-not $env:POSTGRES_TEST_URL) {
    $env:POSTGRES_TEST_URL = $env:POSTGRES_URL
}

if ($RequireTests) {
    $env:UAT_REQUIRE_DB = "1"
}

& "$PSScriptRoot\apply-migrations.ps1"
& "$PSScriptRoot\run-survivability-tests.ps1"

if ($env:UAT_VERIFY_PUBLIC_SCHEMA -eq "1") {
    Push-Location "$repoRoot\Backend\Go"
    try {
        Invoke-Native { go test ./internal/gateway/uat/... -run TestUAT_PublicSchemaAlignedWithMigrations -count=1 -v } -ErrorMessage "UAT Public Schema Alignment Tests Failed"
    } finally {
        Pop-Location
    }
}

Write-Host "Bootstrap and verification complete."
