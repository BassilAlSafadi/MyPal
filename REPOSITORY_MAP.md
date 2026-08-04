# Repository Topology Map

## Services

Six services, each called directly by the frontend. There is no API gateway.

| Service | Language | Path | Datastore |
|---|---|---|---|
| `auth` | C# | `Backend/CSharp/MyPal.Auth` | Postgres `mypal_auth` |
| `listings` | C# | `Backend/CSharp/MyPal.Listings` | Postgres `mypal_listings` |
| `orders` | C# | `Backend/CSharp/MyPal.Orders` | Postgres `mypal_orders` |
| `payments` | C# | `Backend/CSharp/MyPal.Payments` | Postgres `mypal_orders` (shared with orders) |
| `ai` | Go | `Backend/Go/cmd/ai` | MongoDB `mypal_ai` |
| `messaging` | Go | `Backend/Go/cmd/messaging` | MongoDB `mypal_messaging` |

Every service also has a Redis cache with a 5 hour TTL.

`Backend/CSharp/MyPal.ServiceDefaults` is the shared C# library: JWT validation,
CORS, the Redis cache, the internal-token gate and the identity client.
`Backend/Go/internal/servicekit` is its Go counterpart.

## Bounded Contexts
* `MyPal.Auth`: users, sessions, JWT issuance, Google OAuth, profile and location.
* `MyPal.Listings`: products, media, attributes, reviews, wishlist, seller listings, semantic search.
* `MyPal.Orders`: orders, order items, cart, notifications, checkout saga, transactional outbox, idempotency.
* `MyPal.Payments`: wallet balances and the transaction ledger.
* `internal/ai`: agentic search, product copilot, seller analytics, recommendations, data cleaning.
* `internal/messaging`: chat threads, support tickets, negotiation sessions.

## Why orders and payments share a database
`public.wallets` and `public.transactions` are payments-owned but live in
`mypal_orders`. That is what lets order placement debit the wallet inside the
same Postgres transaction — the guarantee the pre-split monolith had. Payments
maps those tables read/write and `public.orders` read-only; Orders owns the
schema and runs the migrations for the whole database.

## Cross-service reads
Splitting the database removed some joins. Each is now an explicit call:

| Caller | Needs | Route |
|---|---|---|
| listings | flip `is_seller` on first listing | `POST auth /api/v1/users/me/promote-seller` |
| orders | product name/price/stock when pricing an order | `POST listings /internal/products/resolve` |
| orders | stock decrement after commit | `POST listings /internal/products/decrement-stock` |
| orders | the buyer's saved delivery address | `GET auth /api/v1/users/me` |
| ai | the active catalogue, wishlist, purchase history | `GET listings /internal/...`, `GET orders /internal/...` |
| ai | persist a seller summary | `POST listings /internal/sellers/report` |
| messaging | the answer to a chat turn | `POST ai /api/v1/ai/fast-search` |

`/internal/*` routes are authenticated with `INTERNAL_SERVICE_TOKEN`, not a user
token, and are exempt from JWT validation.

## Migrations
* `Backend/CSharp/MyPal.Auth/Data/Migrations` — mypal_auth.
* `Backend/CSharp/MyPal.Listings/Data/Migrations` — mypal_listings, including the raw-SQL `product_embeddings` (pgvector) table.
* `Backend/CSharp/MyPal.Orders/Data/Migrations` — mypal_orders, including `saga_steps`, `api_idempotency` and the `process_wallet_payment` trigger.
* MyPal.Payments has no migrations by design — Orders owns the shared schema.

## Contracts
* `shared/contracts/`: standardized DTOs (TypeScript) ensuring parity across Go, C# and the frontend.

## Frontend Domains
* `Frontend/src/config/env.ts`: the per-service base URLs and the path→service routing table.
* `Frontend/src/api/client.ts`: the single API client; callers pass `/api/v1/...` paths and never know which service answers.
* `Frontend/src/services/`: API clients, auth stores, workflow polling.
* `Frontend/src/pages/`: UI components for checkout, AI search, seller dashboard.

## Event Systems
* **NATS JetStream**: optional event bus (`ORDERS`, `INVENTORY`, `CHECKOUT`, `DLQ_*`), owned by the orders service.
* **Outbox**: `mypal_orders.outbox_events`, polled by the orders service's dispatcher.

## Workflow Systems
* **Saga Orchestrator**: the orders service manages distributed state in `saga_states` / `saga_steps`.
* **Reconciliation Worker**: an orders background loop rescuing stuck outbox events, hanging sagas and stale idempotency locks.
