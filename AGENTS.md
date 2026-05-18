# MyPal AI Agents Governance (AGENTS.md)

Welcome to the MyPal repository. This file serves as the canonical root context for AI agents (Codex, Gemini, Claude, ChatGPT, etc.) operating in this codebase.

## Platform Description
MyPal is a distributed multi-vendor marketplace platform leveraging a polyglot architecture, event-driven commerce, and AI orchestration. The system ensures robust reliability via saga orchestration, outbox patterns, and replay-safe consumers.

## Service Ownership
* **Go Gateway**: Orchestration entrypoint, auth propagation, request tracing, middleware, and semantic search routing. No core business logic should reside here.
* **Go Support Service**: Support ticket management, customer communications.
* **Node Orchestrator**: AI workflow orchestration, seller intelligence coordination, fallback routing.
* **Python ProdBERT**: Semantic ranking and product embeddings.
* **C# Main API**: Identity, system-of-record, and canonical EF Core migrations.

## Persistence Ownership
* **PostgreSQL (pgvector)**: Canonical orders, inventory, products, transactions, outbox events, idempotency records (`processed_events`), and saga states.
* **MongoDB**: Execution traces, workflow audit logs, dead-letter forensic records, AI reasoning history.
* **Redis**: Hot saga state, distributed workflow locks, retry coordination.
* **NATS JetStream**: Event transport, replay streams, durable subscriptions, DLQ handling.

## Reliability Guarantees
* **Outbox Pattern**: Transactional guarantees for event dispatching.
* **Replay Safety**: Idempotency enforced via PostgreSQL.
* **Idempotency**: All consumers must execute idempotently using canonical locking or uniqueness checks.
* **DLQ Handling**: Failed events are routed to Dead Letter Queues and audited in MongoDB.
* **Saga Persistence**: Workflow state is reliably stored in PostgreSQL to survive crashes.

## Architecture Constraints
1. NO business logic in the Gateway.
2. Frontend MUST NEVER bypass the Gateway.
3. AI failures MUST NEVER pollute the canonical PostgreSQL database.
4. All consumers MUST be idempotent.
5. Do not modify architecture bounds without explicit authorization.

## Build Commands
* **Go**: `cd Backend/Go && go build ./...`
* **Node**: `cd Backend/Node && npm install && npm start`
* **C#**: `dotnet build Backend/CSharp/MyPal.API/MyPal.API.csproj`
* **Python**: `cd Backend/Python && pip install -r requirements.txt`
* **Frontend**: `cd Frontend && npm install && npm run dev`

## Validation Commands
* Go test: `go test ./...`
* C# test: `dotnet test`

## Forbidden Behaviors
* Bypassing the Gateway for direct DB or service access from the frontend.
* Making destructive DB changes without EF Core migrations.
* Putting AI execution logic directly into the synchronous checkout flow.

## Coding Standards
* Prefer explicit dependency injection.
* Enforce typed contracts (`shared/contracts`).
* Write structured logs with `trace_id`.

## Observability Standards
* Always propagate `X-Trace-ID`.
* Append to MongoDB for long-running workflow audits.

## Distributed Systems Requirements
* Compensating actions must be explicit and idempotent.
* Use `FOR UPDATE SKIP LOCKED` for inventory.
