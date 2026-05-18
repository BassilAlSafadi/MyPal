# Applies all EF Core migrations and verifies gateway schema expectations.
# Usage:
#   $env:POSTGRES_URL = "Host=localhost;Database=mypal;Username=postgres;Password=YOUR_PASSWORD"
#   .\scripts\uat\apply-migrations.ps1

$ErrorActionPreference = "Stop"
$env:PATH = "$env:USERPROFILE\.dotnet\tools;" + $env:PATH

. (Join-Path $PSScriptRoot "load-env.ps1")
. (Join-Path $PSScriptRoot "Invoke-Native.ps1")

if (-not $env:POSTGRES_URL -and -not $env:POSTGRES_SESSION_URL) {
    Write-Error "POSTGRES_URL or POSTGRES_SESSION_URL is required (copy .env.example to .env or use bootstrap-and-verify.ps1 -StartDocker)."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

Push-Location "$repoRoot\Backend\CSharp"
try {
    Write-Host "==> Listing migrations"
    Invoke-Native { dotnet ef migrations list `
        --project MyPal.Infrastructure/MyPal.Infrastructure.csproj `
        --startup-project MyPal.API/MyPal.API.csproj } -ErrorMessage "EF Migrations List Failed"

    Write-Host "==> Applying migrations (database update)"
    Invoke-Native { dotnet ef database update `
        --project MyPal.Infrastructure/MyPal.Infrastructure.csproj `
        --startup-project MyPal.API/MyPal.API.csproj } -ErrorMessage "EF Database Update Failed"

    Write-Host "==> Verifying no pending model changes"
    Invoke-Native { dotnet ef migrations has-pending-model-changes `
        --project MyPal.Infrastructure/MyPal.Infrastructure.csproj `
        --startup-project MyPal.API/MyPal.API.csproj } -ErrorMessage "Pending model changes detected - create a new migration before UAT."
}
finally {
    Pop-Location
}

Write-Host "==> Gateway schema verification (Go)"
if (-not $env:POSTGRES_TEST_URL) {
    $env:POSTGRES_TEST_URL = $env:POSTGRES_URL
}
Push-Location "$repoRoot\Backend\Go"
try {
    Invoke-Native { go test ./internal/gateway/uat/... -run TestUAT_SchemaMatchesRuntimeQueries -count=1 -v } -ErrorMessage "UAT Schema Runtime Queries Tests Failed"

    $env:UAT_VERIFY_PUBLIC_SCHEMA = "1"
    Invoke-Native { go test ./internal/gateway/uat/... -run TestUAT_PublicSchemaAlignedWithMigrations -count=1 -v } -ErrorMessage "UAT Public Schema Alignment Tests Failed"
}
finally {
    Pop-Location
}

Write-Host "Done. Run full matrix: .\scripts\uat\run-survivability-tests.ps1"
