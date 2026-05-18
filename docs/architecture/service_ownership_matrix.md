# Service Ownership Matrix

This document defines the canonical owner for every functional domain within the MyPal ecosystem.

| Domain | Owner Service | Data Store Authority |
| :--- | :--- | :--- |
| **Auth & Identity** | C# Main API | PostgreSQL |
| **User Profiles** | C# Main API | PostgreSQL |
| **Inventory & Products** | C# Main API | PostgreSQL |
| **Orders & Checkout** | C# Main API | PostgreSQL |
| **Payments** | C# Main API | PostgreSQL (Audit in Mongo) |
| **Semantic Search** | Python ProdBERT | PostgreSQL (via pgvector) |
| **Text Embeddings** | Python ProdBERT | N/A |
| **Ranking Intelligence** | Python ProdBERT | N/A |
| **AI Orchestration** | Node LLM Orchestrator | N/A (Logs in Mongo) |
| **Seller Summaries** | Node LLM Orchestrator | PostgreSQL (Summaries) |
| **Audit Trails** | Go Support | MongoDB |
| **Reasoning Traces** | Node LLM Orchestrator | MongoDB |
| **Active Sessions** | Go Support | Redis |
| **Hot Narratives** | Go Support | Redis |
| **Notifications** | Go Support | N/A |
| **API Routing** | Go Gateway | N/A |
| **SSQL Validation** | Go Gateway | N/A |
| **Request Tracing** | Go Gateway | MongoDB |

## Ownership Invariants

1.  **PostgreSQL is the ONLY System of Record**: Any data that represents the current, definitive state of a commercial entity (User, Order, Balance, Product) must reside here.
2.  **C# Ownership of SoR**: C# is the final authority for the logic surrounding core commerce entities. No other service may write directly to these tables unless explicitly delegated via a shared repository pattern (Go Support sync logic).
3.  **Python Non-Ownership**: Python owns the intelligence layer but NEVER the canonical state. It consumes data and produces vectors/ranks, but does not manage the lifecycle of the source data.
4.  **MongoDB Append-Only**: MongoDB is for append-only data (logs, traces). It must never be the source of truth for a user's current status or balance.
5.  **Redis Ephemerality**: Redis is hot and fast but ephemeral. The system must be able to recover from a complete Redis flush without losing permanent user data.
