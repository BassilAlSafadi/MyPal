# Project Context

## Executive Summary
MyPal is evolving into a production-grade AI-native distributed commerce ecosystem. We have successfully transitioned from a monolithic stub into a distributed, event-driven polyglot platform with full semantic search, AI orchestration, and saga-based checkout workflows.

## Current Platform Maturity
* **Architecture**: Distributed Polyglot (Go, C#, Node, Python).
* **Communication**: NATS JetStream event bus, REST Gateway.
* **State Management**: Zero-trust auth via Go Gateway, persistent orchestration in PostgreSQL, auditing in MongoDB.

## Completed Implementation Phases
* **Phase 1**: Gateway foundation and middleware routing.
* **Phase 2**: Identity validation, pgvector search integration, and hybrid ranking.
* **Phase 3**: Agentic workflows, outbox pattern, inventory reservation locking.
* **Phase 4**: Event consumers, idempotency layer, saga state persistence, DLQ, and compensation engines.

## Active Distributed Guarantees
* **At-Least-Once Delivery**: Guaranteed via Outbox pattern.
* **Exactly-Once Processing**: Enforced by idempotency managers.
* **Eventual Consistency**: Reconciled by background worker routines and persistent saga state.

## Remaining Risks
* Real-time UI updates are limited to polling.
* Payment provider orchestration is scaffolded but not fully integrated.
* System still requires Kubernetes transition and production scaling configurations.

## Next Architectural Goals
* Production infrastructure deployment (Docker Swarm/Kubernetes).
* Real-time WebSockets integration.
* Comprehensive payment integration.
