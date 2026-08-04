# Current System State

## Architecture
Six microservices, called directly by the frontend. The Go API gateway and the
Node.js orchestrator have both been retired.

* **ai** (Go) → MongoDB `mypal_ai`
* **auth** (C#) → Postgres `mypal_auth`
* **messaging** (Go) → MongoDB `mypal_messaging`
* **orders** (C#) → Postgres `mypal_orders`
* **payments** (C#) → Postgres `mypal_orders` (shared with orders)
* **listings** (C#) → Postgres `mypal_listings`

Every service has a Redis cache with a 5 hour TTL.

## Completed Systems
* **Identity Infrastructure**: C# JWT issuance, Google OAuth, role-based access (`is_buyer`, `is_seller`). Each service validates tokens itself.
* **Semantic Search**: pgvector integration, ProdBERT embeddings, hybrid ranking (vector + BM25 + seller trust), now inside the listings service.
* **Distributed Checkout**: parent/child order splitting, geo-snapshotting, saga state persisted before the order insert.
* **Event Architecture**: transactional outbox, NATS JetStream, outbox dispatcher, idempotency enforcement — all owned by the orders service.
* **Saga Coordination**: saga state in `mypal_orders`, compensation boundaries recorded per step.
* **AI Orchestration**: Go agentic workflow with provider fallback, MongoDB audit logs (agent execution traces, validation logs).
* **Messaging**: chat threads, support tickets and negotiation sessions on MongoDB; the AI reply comes from the ai service.
* **Frontend Workflow UI**: auth store (Zustand), search store, real-time polling UX (`SagaTracker.tsx`).

## Partially Implemented Systems
* **Realtime Notifications**: currently polling-based; WebSockets scaffolded but not mapped to any service.
* **Payment Orchestration**: the saga captures boundaries, but external provider integration is stubbed.
* **Seller Dashboards**: APIs exist for AI metrics, but full CRUD UI flows are pending.

## Missing Production Infrastructure
* Kubernetes deployment manifests (docker-compose and a Render blueprint exist).
* Production grade CI/CD pipelines.
* Secret rotation strategy.
* Rate limiting and WAF rules. The gateway's global rate limiter was not
  reinstated per-service during the split.

## Known Technical Debt
* SSQL query validation is regex-based; needs a full AST parser.
* NATS connection logic could use more advanced clustering configuration.
* `process_wallet_payment` was reconstructed from documented behaviour during the
  split — its original DDL only ever existed in the hosted Supabase project, never
  in this repository. Verify it against production before relying on it.
* The saga compensation worker exists in history but was never started by any
  process; it was not carried into the orders service.

## Reliability Status
* Outbox and idempotency managers ensure no double processing or lost messages.
* Sagas are safely recoverable from `mypal_orders` after crashes.
* Redis is an optimisation, never a dependency: every service serves from its
  database when the cache is unreachable.

## Operational Risks
* MongoDB is treated as append-only but needs TTL indexes for unbounded audit collections.
* The reconciliation worker runs on one node; needs leader election if horizontally scaled.
* Cross-service reads (orders→listings, orders→auth, ai→listings) are new failure
  points that the single database did not have. Stock decrement after an order
  commit is logged-and-continued rather than retried.

## Event Consistency Guarantees
* Strong transactional boundary inside `mypal_orders` prior to asynchronous fan-out.
* The order insert and its wallet debit remain in one transaction, which is why
  orders and payments deliberately share a database.

## AI Isolation Guarantees
* AI service failures trigger degraded default responses without halting core
  transactional flows. Each model node falls back to a deterministic mock when its
  provider key is missing or the call fails.
