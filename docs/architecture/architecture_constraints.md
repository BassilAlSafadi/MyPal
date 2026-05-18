# Architecture Constraints

All future development on the MyPal platform must strictly adhere to these non-negotiable constraints.

## 1. Network & Communication
*   **Gateway Intermediation**: No direct frontend access to internal services. All external traffic **MUST** pass through the Go Gateway at `:8080`.
*   **Authentication**: Internal services must authenticate via a shared `INTERNAL_SERVICE_TOKEN`.
*   **Observability**: Every inter-service call must include a correlation ID for request tracing.
*   **OpenAPI**: All new API endpoints must be documented with OpenAPI/Swagger.

## 2. Persistence Invariants
*   **PostgreSQL Canonicality**: ONLY PostgreSQL is the canonical system-of-record.
*   **Redis Non-Canonicality**: Redis is strictly for hot state, ephemeral sessions, and caching. It must never hold the only copy of permanent business data.
*   **MongoDB Role**: MongoDB is strictly for append-only audit trails, reasoning traces, and agent logs. It must not own transactional commerce entities.
*   **Order Geo-Integrity**: All orders require a geo-snapshot at checkout. Historical orders must not rely on current user address fields.
*   **Distributed Transactions**: Inter-service state synchronization (e.g., Go Support syncing to PG/Mongo/Redis) must eventually adopt the **Saga or Outbox pattern** to prevent split-brain scenarios.

## 3. AI & LLM Governance
*   **Auditability**: All AI reasoning, prompts, and provider responses must be logged to MongoDB.
*   **Data Pollution**: AI provider failures (timeouts, hallucinations, empty responses) must **NEVER** pollute canonical databases with error notes or corrupted data. Fallbacks must be handled at the orchestration layer.
*   **Inference Ownership**: Semantic ranking and embedding generation are exclusive to the Python ProdBERT service.

## 4. Service Boundaries
*   **Go Gateway**: Restricted to routing, validation, and orchestration coordination. It must not contain heavy business logic or canonical data ownership.
*   **C# Authority**: C# is the final authority for Identity, Users, and core SoR entities.
*   **Mock Exclusion**: No mock services or hardcoded responses are permitted in production execution paths. Mocks are restricted to development and local testing.

## 5. Security Invariants
*   **Internal Token Integrity**: Internal service-to-service calls without a valid `INTERNAL_SERVICE_TOKEN` must be rejected.
*   **Validation**: All user-provided search queries must pass through the SSQL validation gate before reaching downstream services.
