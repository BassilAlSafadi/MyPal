# Manual hostile UAT scenarios — run with gateway + Postgres + NATS up.
#   $env:POSTGRES_URL = "postgresql://..."
#   $env:GATEWAY_URL = "http://localhost:8080"
#   .\scripts\uat\manual-hostile-scenarios.ps1

param(
    [string]$GatewayUrl = $(if ($env:GATEWAY_URL) { $env:GATEWAY_URL } else { "http://localhost:8080" }),
    [string]$PostgresUrl = $env:POSTGRES_URL
)

$ErrorActionPreference = "Stop"
if (-not $PostgresUrl) { Write-Error "POSTGRES_URL required for DB checks" }

Write-Host @"

Manual hostile scenario checklist
=================================
1. Kill gateway mid-checkout
   - Start checkout (Idempotency-Key: hostile-mid-1), kill gateway process during request.
   - Restart gateway; retry same key+body → expect Idempotent-Replay or single side effect.
   - Query: SELECT status FROM saga_states ORDER BY updated_at DESC LIMIT 5;

2. Retry same request
   - Repeat identical POST with same Idempotency-Key → 2xx + Idempotent-Replay: true

3. Retry different payload, same key
   - Change JSON body, same key → HTTP 409 idempotency_key_reuse_with_different_request

4. Force compensation transient failure
   - Insert FAILED saga (or stall PROCESSING >10m); watch compensation_worker logs.
   - Verify retry_count increases and updated_at is in the future (bounded backoff).

5. Inject poison NATS event
   - Publish malformed envelope to a subscribed subject.
   - Verify: SELECT * FROM gateway_poison_events ORDER BY created_at DESC LIMIT 5;

6. Restart workers mid-saga
   - Stop gateway (workers drain); restart; FAILED/COMPENSATING sagas should resume.

7. Restart NATS
   - Restart NATS; gateway should reconnect; outbox republishes pending rows.

8. Restart Postgres
   - Brief outage; gateway readiness fails; after recovery, workers resume.

Gateway: $GatewayUrl
Postgres: (configured)

"@

Write-Host "Example idempotency probe (adjust path/auth as needed):"
$key = [guid]::NewGuid().ToString()
Write-Host "  Idempotency-Key: $key"
