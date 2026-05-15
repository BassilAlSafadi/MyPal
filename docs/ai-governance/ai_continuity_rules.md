# AI Continuity Rules

This document outlines the operational boundaries and prompt standards for AI agents (Codex, Gemini, Claude) operating within the MyPal codebase.

## 1. Prompt Standards
* Always define your bounded context before emitting code.
* Verify dependencies in the `AGENTS.md` and `PROJECT_CONTEXT.md` files.
* Do not infer architectural shifts. If a system requires a new dependency (e.g., Kafka instead of NATS), reject the prompt unless explicitly given the "Principal Architect" role.

## 2. Bounded Implementation Rules
* **Cross-Language Parity**: If modifying a DTO in C#, you MUST update the `shared/contracts` TypeScript definitions and the corresponding Go struct.
* **Database Isolation**: Do not route Node.js orchestrator queries directly into PostgreSQL. 

## 3. Architecture Preservation Rules
* Preserve the Outbox pattern. Do not emit synchronous NATS publish calls inside HTTP handlers.
* Maintain the zero-trust auth barrier in the Go Gateway. Do not move auth validation downstream.

## 4. Anti-Hallucination Safeguards
* If a file path is requested but doesn't exist, check `REPOSITORY_MAP.md` before generating an entirely new subsystem.
* Do not invent new MongoDB collections without creating the corresponding Mongoose schema in `Backend/Node/models.js`.

## 5. Distributed Systems Safety Rules
* Adhere strictly to the `/docs/distributed-systems-safety.md` guidelines for idempotency and replay safety.
