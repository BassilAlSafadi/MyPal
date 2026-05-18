# MyPal System Manifest

## 1. Service Inventory

| Service | Technology | Port | Primary Responsibility |
| :--- | :--- | :--- | :--- |
| **Go Gateway** | Go (1.22+) | `:8080` | Entry point, routing, middleware, request tracing, and validation orchestration. |
| **Go Support** | Go (1.22+) | `:5001` | Real-time communication, session management, and polyglot state synchronization. |
| **Node Orchestrator** | Node.js / Express | `:5003` | AI workflow orchestration (Gemini/Cohere), review mapping, and seller identity generation. |
| **Python ProdBERT** | Python / FastAPI | `:8001` | Semantic search intelligence, vector embedding generation, and ranking inference. |
| **C# Main API** | .NET 9 / EF Core | `:5000` | Canonical identity, user management, and system-of-record business entities. |
| **Frontend** | React / Vite | N/A | User interface (Web). Currently transitioning from mock-heavy state to integrated state. |

## 2. Infrastructure Topology

### 2.1 Persistence Layer
*   **PostgreSQL + pgvector**: Canonical System-of-Record (SoR). Stores users, orders, products, and high-dimensional semantic vectors.
*   **MongoDB**: AI audit trails, reasoning traces, agent logs, and historical metadata.
*   **Redis**: Hot state, ephemeral session narratives, and temporary orchestration state.

### 2.2 Network Boundary
*   **External Traffic**: Must terminate at the **Go Gateway**.
*   **Internal Traffic**: Inter-service communication via private Docker network. Direct access to internal services from the public internet is strictly forbidden.

## 3. Communication Flows

### 3.1 Frontend-to-Backend
`Frontend` → `Go Gateway` → `Target Service` (C#, Node, or Go Support)

### 3.2 AI Orchestration Flow
`Go Gateway` → `Node Orchestrator` → `Python ProdBERT` (Embeddings) → `PostgreSQL` (Vector Search)

### 3.3 State Synchronization Flow
`Go Support` → `Redis` (Hot) + `MongoDB` (Audit) + `PostgreSQL` (SoR)

## 4. Logical Architectures

### 4.1 Semantic Search Overview
User queries are validated by the Gateway, embedded into vectors by Python ProdBERT, and matched against `pgvector` stored in PostgreSQL.

### 4.2 AI Orchestration Overview
Node.js acts as the primary brain for multi-step LLM tasks, fetching raw data from PostgreSQL, processing via external AI providers, and logging reasoning traces to MongoDB.
