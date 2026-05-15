# Current System State

## Completed Systems
* **Go Gateway Framework**: API routing, reverse proxy, request tracing, zero-trust JWT stripping.
* **Identity Infrastructure**: C# JWT issuance, Google OAuth, role-based access (`is_buyer`, `is_seller`).
* **Semantic Search**: pgvector integration, Python ProdBERT embeddings, hybrid ranking (vector + BM25 + seller trust).
* **Distributed Checkout**: Parent/child order splitting, geo-snapshotting, `FOR UPDATE SKIP LOCKED` inventory reservation.
* **Event Architecture**: Transactional outbox pattern, NATS JetStream setup, outbox dispatcher, idempotency enforcement.
* **Saga Coordination**: Saga state persistence in PostgreSQL, compensation engine (inventory release/order cancel).
* **AI Orchestration**: Node.js endpoints with provider fallback (Cohere/Gemini), MongoDB audit logs (Agent Execution Traces, Validation Logs).
* **Frontend Workflow UI**: Auth store (Zustand), Search store, real-time polling UX (`SagaTracker.tsx`).

## Partially Implemented Systems
* **Realtime Notifications**: Currently polling-based; WebSockets scaffolded but not fully mapped to Gateway.
* **Payment Orchestration**: Saga captures boundaries, but actual external provider integration is stubbed.
* **Seller Dashboards**: APIs exist for AI metrics, but full CRUD UI flows are pending.

## Missing Production Infrastructure
* Docker Compose / Kubernetes deployment manifests.
* Production grade CI/CD pipelines.
* Secret rotation strategy.
* Rate limiting and WAF rules.

## Known Technical Debt
* SSQL query validation is currently regex-based; needs full AST parser.
* NATS connection logic could use more advanced clustering configuration.

## Reliability Status
* Outbox pattern and Idempotency managers ensure no double processing or lost messages.
* Sagas are safely recoverable from PostgreSQL after crashes.

## Operational Risks
* MongoDB is treated as append-only but needs TTL indexes for unbounded audit collections.
* Background reconciliation worker currently runs on one node; needs leader election if horizontally scaled.

## Replay Guarantees
* Event replays from DLQ are operator-gated to prevent accidental idempotency violations.

## Event Consistency Guarantees
* Strong transactional boundary inside PostgreSQL prior to asynchronous message fan-out.

## AI Isolation Guarantees
* AI service failures trigger degraded default responses (e.g. `Analysis failed`) without halting core transactional flows.
