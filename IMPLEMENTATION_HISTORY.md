# Implementation History

## Phase 1: Gateway Foundation
* **Goals**: Establish centralized orchestration entrypoint.
* **Services Modified**: Go Gateway.
* **Major Decisions**: Go chosen for Gateway performance; reverse proxy topology established.
* **Guarantees Achieved**: Request tracing, middleware hooks.
* **Remaining Gaps**: No real auth context or internal traffic routing.

## Phase 2: Identity + Semantic Search
* **Goals**: De-mock authentication and implement real search algorithms.
* **Services Modified**: C# API, Go Gateway, Frontend.
* **Major Decisions**: Zero-trust auth flow; Hybrid ranking algorithm (60% Vector, 25% BM25, 10% Trust, 5% Recency).
* **Guarantees Achieved**: Verified JWT propagation, explainability metadata.
* **Remaining Gaps**: SSQL parser is still regex-based.

## Phase 3: Event Workflows + Outbox + NATS
* **Goals**: Agentic commerce and asynchronous coordination.
* **Services Modified**: Go Gateway, Node Orchestrator, PostgreSQL schema.
* **Major Decisions**: Implement transactional outbox pattern instead of two-phase commit; use MongoDB for AI traces to keep Postgres lean.
* **Guarantees Achieved**: At-least-once dispatch, inventory lock safety (`FOR UPDATE SKIP LOCKED`).
* **Remaining Gaps**: Consumers lack retry logic and idempotency.

## Phase 4: Reliability + Replay Safety + DLQ + Compensation
* **Goals**: Transform into a self-consistent, fault-tolerant distributed system.
* **Services Modified**: Go Gateway, Node MongoDB Schema, C# Entity Framework.
* **Major Decisions**: Canonical persistence of Saga states in Postgres; NATS DLQ streams; operator-gated replay.
* **Guarantees Achieved**: Exactly-once processing, eventual consistency via background reconciliation, crash resilience.
* **Remaining Gaps**: Real-time frontend updates rely on polling.
