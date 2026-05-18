# Distributed Systems Safety Requirements

## 1. Replay Safety
All consumers must handle the possibility of receiving the same message multiple times.
* Do not rely on in-memory counters.
* Do not append to arrays without uniqueness checks.

## 2. Idempotency
Use the canonical `IdempotencyManager` (`processed_events` table in PostgreSQL).
* Every consumer must insert its `consumer_name` + `event_id`.
* The insert must fail or skip if a duplicate is found, halting further execution.

## 3. Eventual Consistency
The system embraces eventual consistency across bounded contexts.
* Do not implement Two-Phase Commits (2PC) or distributed locking across services.
* Use Saga orchestration for distributed state management.

## 4. Compensation Safety
All compensating actions (rollbacks) must be idempotent.
* Reversing an inventory decrement requires checking if the rollback has already occurred to avoid double-crediting stock.

## 5. Distributed Lock Safety
* Use Redis for transient locks (e.g., rate limiting, session locking).
* Do NOT use Redis for Saga coordination state; use PostgreSQL.

## 6. Outbox Guarantees
* No external API calls or NATS publishing during the primary database transaction.
* Write the `outbox_event` payload within the same SQL transaction as the canonical entity mutation.

## 7. DLQ Handling
* Do not drop failed messages silently.
* Route exhausted retries to NATS Dead Letter Queues (e.g., `DLQ_ORDERS`).
* Audit failures in MongoDB for forensic replay.

## 8. Reconciliation Semantics
* Background workers must be able to gracefully detect and resolve split-brain states (e.g., stuck outbox events, hanging sagas).
