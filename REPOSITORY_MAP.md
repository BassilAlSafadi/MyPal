# Repository Topology Map

## Services
* `Backend/Go/cmd/gateway`: Centralized API Gateway, auth stripping, and reverse proxy.
* `Backend/CSharp/MyPal.API`: System-of-record, identity provider, EF Core migrations.
* `Backend/Node`: AI Orchestrator, LLM integrations (Cohere/Gemini), seller metrics.
* `Backend/Python`: ProdBERT semantic embedding service.

## Bounded Contexts
* `internal/gateway/checkout`: Checkout orchestration, inventory reservation, saga compensation.
* `internal/gateway/messaging`: NATS integrations, consumers, outbox dispatcher, DLQ, idempotency.
* `internal/gateway/search`: Semantic search routing.
* `internal/gateway/auth`: JWT validation.

## Infra Folders
* `Backend/CSharp/MyPal.Infrastructure/Data/Migrations`: PostgreSQL schemas.
* `Backend/Node/models.js`: MongoDB schemas for audit.

## Contracts
* `shared/contracts/`: Standardized DTOs (TypeScript) ensuring parity across Go, C#, Node, and Frontend. Contains `checkout`, `dlq`, `events`, `orchestration`, `saga`, `seller`.

## Orchestration Layers
* **Go Gateway**: API routing, synchronous validation.
* **Node Orchestrator**: Async AI agent execution, seller tools.

## Frontend Domains
* `Frontend/src/services/`: API clients, auth stores, workflow polling.
* `Frontend/src/pages/`: UI components for checkout, AI search, seller dashboard.

## Event Systems
* **NATS JetStream**: Core event bus (`ORDERS`, `INVENTORY`, `CHECKOUT`, `DLQ_*`).
* **Outbox**: PostgreSQL `outbox_events` polled by Go dispatcher.

## Workflow Systems
* **Saga Orchestrator**: Go Gateway manages distributed state in `saga_states`.
* **Reconciliation Worker**: Go background loop rescuing stuck outbox events and hanging sagas.
