# Loads repo-root .env into the current PowerShell session (simple KEY=VALUE parser).
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$envFile = Join-Path $repoRoot ".env"
if (-not (Test-Path $envFile)) {
    return
}
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) { $val = $val.Substring(1, $val.Length - 2) }
    if (-not (Get-ChildItem Env:$key -ErrorAction SilentlyContinue)) {
        [Environment]::SetEnvironmentVariable($key, $val, "Process")
        # Write-Host "DEBUG: Loaded $key"
    }
}
if (-not $env:POSTGRES_TEST_URL -and $env:POSTGRES_URL) {
    $env:POSTGRES_TEST_URL = $env:POSTGRES_URL
}
