# Communication Contracts

This document defines the allowed communication paths and protocols between services in the MyPal ecosystem.

## 1. Directional Constraints

| Source | Allowed Destination(s) | Protocol |
| :--- | :--- | :--- |
| **Frontend** | Go Gateway | HTTPS/JSON |
| **Go Gateway** | C# API, Go Support, Node Orchestrator | HTTP/JSON + Internal Token |
| **Node Orchestrator** | Python ProdBERT, PostgreSQL | HTTP/JSON, TCP (PG) |
| **Go Support** | PostgreSQL, MongoDB, Redis | TCP (PG), TCP (Mongo), TCP (Redis) |
| **C# Main API** | PostgreSQL | TCP (PG) |

## 2. Forbidden Paths
*   **Direct Frontend-to-Service**: Frontend must **NEVER** bypass the Go Gateway to call C#, Node, or Python services directly.
*   **Service-to-Frontend**: Backend services never initiate contact with the Frontend (except via WebSocket in Go Support).
*   **C# to AI Services**: C# must not call Python or Node services directly. Intelligence requirements must be handled by the Gateway or Support service.

## 3. Communication Patterns

### 3.1 Synchronous (REST/HTTP)
*   **Search**: `Gateway -> SSQL -> Python -> Postgres`. Must return within 2000ms.
*   **Auth**: `Gateway -> C# Identity`. Critical path.
*   **Health**: All services provide a `/health` endpoint for Docker/Gateway monitoring.

### 3.2 Asynchronous (Future Expectations)
*   **Audit Logging**: Should move to an asynchronous background task to avoid blocking business logic.
*   **Order Splitting**: Will utilize an event bus (NATS/RabbitMQ) to coordinate between Inventory and Checkout.
*   **Notification Dispatch**: Go Support will consume events to trigger real-time pushes.

## 4. Gateway Orchestration Boundaries
The Go Gateway is the "Director" for the following multi-service flows:
1.  **AI-Native Search**: Orchestrates Python embedding and Postgres vector lookup.
2.  **Seller Reporting**: Orchestrates data retrieval from Postgres and transformation via Node LLM.
3.  **Support Ticket Analysis**: Orchestrates ticket creation in C# and analysis in Python.
