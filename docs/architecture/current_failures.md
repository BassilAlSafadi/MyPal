# Current Architecture Failures & Technical Debt

This document identifies existing gaps and weaknesses in the MyPal platform that must be addressed during the upcoming refactor stages.

## 1. Frontend Integration Gaps
*   **Complete Mock Dependency**: The frontend is currently 100% mocked via `useMockStore.ts` and `searchService.ts`. No real data flows from the backend services to the user interface.
*   **Fake Auth**: `authService.ts` fakes login/signup without hitting the C# Identity layer.

## 2. Persistence & Synchronization Risks
*   **Split-Brain Risk**: The `life_track_sync.go` service uses a best-effort manual compensation logic for cross-store writes. A failure during compensation will cause Postgres, MongoDB, and Redis to diverge permanently.
*   **Duplicated State**: Location data is currently managed in an uncoordinated fashion between C# entities and Go models, increasing the risk of schema desynchronization.

## 3. Security Weaknesses
*   **Brittle SSQL Validation**: The `validate-ssql` endpoint in the Go Support service relies on a simplistic regex. This is a significant security bottleneck and easily bypassed.
*   **Exposed Internal Ports**: Docker Compose exposes internal service ports (5000, 5001, 5002, 8001) to the host machine, bypassing the Gateway security layer.

## 4. Orchestration & Pipeline Fractures
*   **Disconnected Semantic Search**: While Python ProdBERT exists, the Go Gateway does not currently coordinate the search flow (`Gateway -> SSQL -> Python -> Postgres`).
*   **Stubbed AI Logic**: Multiple Python routes (`/analyze`, `/suggest-reply`) are empty stubs.
*   **Polluted SoR**: The Node.js orchestrator currently writes error notes (e.g., `"NO_LLM_CONFIGURED"`) into the canonical PostgreSQL database, violating the "No Pollution" constraint.

## 5. Scaling Bottlenecks
*   **Synchronous LLM Calls**: Many AI orchestration paths are synchronous, creating high latency for user-facing requests and making the system vulnerable to AI provider timeouts.
*   **Lack of Circuit Breakers**: There are currently no circuit breakers or sophisticated retry policies for inter-service communication or external AI provider calls.
