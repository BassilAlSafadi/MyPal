# Go Backend Agent Context

## Ownership Boundaries
* Orchestration Gateway, NATS integration, outbox worker, semantic search routing, middleware.
* DO NOT implement direct entity mutation (e.g., product updates) without using canonical DB procedures.

## Coding Patterns
* `slog` for structured logging. Must include `trace_id`.
* Use `pgxpool` directly for DB interactions, favoring raw SQL (`FOR UPDATE SKIP LOCKED`) over ORMs for performance critical paths.
* Interfaces for all Repositories.

## Testing Commands
* `go test ./...`
* `go build ./...`

## Reliability
* Implement `IdempotencyManager` checks in all new consumers.
* Use `DomainEvent<T>` for all NATS messages.
