# MyPal — AI-Native Commerce Platform

**MyPal** is a mobile-first, AI-native marketplace where every account is both a **buyer and a seller**. Users discover products through natural-language AI search, list their own items in seconds, pay from an in-app wallet, and check out through a resilient, event-driven backend.


> Sign up with email + password or continue with Google. New accounts get a welcome wallet balance to try the full buy/sell/checkout flow.

---

## Table of Contents

- [What MyPal Does](#what-mypal-does)
- [Architecture Overview](#architecture-overview)
- [Request Lifecycle](#request-lifecycle)
- [Services](#services)
- [Tech Stack](#tech-stack)
- [Security Model](#security-model)
- [Data Layer](#data-layer)
- [Local Development](#local-development)
- [Repository Layout](#repository-layout)

---

## What MyPal Does

| Area | Capabilities |
|------|--------------|
| **Discovery** | Natural-language AI search, semantic (vector) product matching, hybrid ranking, AI chat assistant |
| **Selling** | List a product with photos in seconds — any account can sell; sellers can only edit/delete their own listings |
| **Buying** | Cart, wishlist, single-page checkout, in-app wallet, Cash-on-Delivery or wallet/split payment |
| **Wallet** | Welcome balance, deposits, withdrawals, and a transaction ledger kept consistent with every purchase |
| **AI Assistance** | Deep & fast search, product Q&A, recommendations, translation, summarization, and seller analytics |
| **Accounts** | Email/password (PBKDF2-hashed) and Google OAuth, with cross-device session persistence |

---

## Architecture Overview

MyPal is a **distributed, polyglot, AI-native platform**: six independently
deployable microservices, each owning its own datastore, called directly by the
browser. Every service validates the access token itself and caches its reads in
Redis on a shared 5 hour policy.

```
                          ┌─────────────────────────────┐
                          │   React SPA  (Vercel)       │
                          └──────────────┬──────────────┘
                                         │ HTTPS (Bearer access token)
        ┌──────────┬───────────┬─────────┼─────────┬───────────┬──────────┐
        ▼          ▼           ▼         ▼         ▼           ▼          │
   ┌────────┐ ┌────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ┌────────┐ │
   │   ai   │ │  auth  │ │messaging │ │ orders │ │ listings │ │payments│ │
   │   Go   │ │   C#   │ │    Go    │ │   C#   │ │    C#    │ │   C#   │ │
   ├────────┤ ├────────┤ ├──────────┤ ├────────┤ ├──────────┤ ├────────┤ │
   │agentic │ │identity│ │  chat    │ │ orders │ │ products │ │ wallet │ │
   │search ·│ │sessions│ │ threads ·│ │ cart · │ │ media ·  │ │ ledger │ │
   │ask ·   │ │profiles│ │ support ·│ │notifs ·│ │reviews · │ │        │ │
   │recommend│ │OAuth  │ │negotiate │ │ saga · │ │wishlist ·│ │        │ │
   │· seller │ │        │ │          │ │ outbox │ │ search   │ │        │ │
   └───┬────┘ └───┬────┘ └────┬─────┘ └───┬────┘ └────┬─────┘ └───┬────┘ │
       │          │           │           │           │           │      │
       ▼          ▼           ▼           ▼           ▼           ▼      │
  ┌─────────┐ ┌────────┐ ┌──────────┐ ┌──────────────────┐ ┌───────────┐ │
  │ MongoDB │ │Postgres│ │ MongoDB  │ │     Postgres     │ │  Postgres │ │
  │mypal_ai │ │ mypal_ │ │ mypal_   │ │   mypal_orders   │ │  mypal_   │ │
  │         │ │  auth  │ │messaging │ │     (shared)     │ │ listings  │ │
  └─────────┘ └────────┘ └──────────┘ └──────────────────┘ └───────────┘ │
                                                                          │
       └──────────────── Redis cache, 5h TTL, per service ───────────────┘
```

One supporting service sits behind that row rather than in front of it:

```
   ┌──────────┐  embed search query  ┌──────────┐
   │ listings │ ───────────────────▶ │ prodbert │   Node 20 + ONNX
   └──────────┘                      │          │   MiniLM-L3-v2
   ┌──────────┐  embed candidates    │  Node    │   384-dim output
   │    ai    │ ───────────────────▶ │          │   stateless, no DB
   └──────────┘                      └──────────┘
```

**`prodbert` is a supporting service, not a seventh domain.** It owns no data: it
turns text into a 384-dimensional vector and nothing else. `listings` calls it to
embed a search query; `ai` calls it to embed candidates before its recommender
re-ranks them. The same model embeds every product into
`mypal_listings.product_embeddings` — query-time and index-time embeddings must
come from the same model or cosine similarity is meaningless.

**Orders and payments deliberately share `mypal_orders`.** `wallets` and
`transactions` are payments-owned but live there, which is what lets an order
insert and its wallet debit stay in one Postgres transaction — the guarantee the
pre-split monolith had.

---

## Request Lifecycle

A typical authenticated call — e.g. placing an order:

1. **SPA → orders.** The React app resolves `/api/v1/orders` to the orders service (`src/config/env.ts`) and sends the request with an in-memory `Bearer` access token.
2. **Zero-trust validation.** The service strips any client-supplied `X-User-*` headers, validates the JWT (HS256) with the shared secret, then **re-injects trusted** `X-User-Id`, `X-User-Roles`, `X-User-Email` onto the request. `Idempotency-Key` replay protection is applied here.
3. **orders → listings.** Product name, price and stock are fetched from the listings service — `products` lives in `mypal_listings`, so this is no longer a join.
4. **orders → PostgreSQL (transaction).** The order is inserted (a DB trigger computes the wallet/COD split and debits `wallets`), a `Purchase` ledger row is written, and the cart is cleared — all atomically, because those tables are all in `mypal_orders`.
5. **orders → listings.** Stock decrements are applied after the commit, since they now cross a database boundary.

AI calls (`/api/v1/ai/...`) go straight to the ai service, which calls the
appropriate LLM/search provider and returns structured results. Chat threads
(`/api/v1/ai/threads`) go to messaging, which stores the conversation and asks
the ai service for each reply.

### Semantic search

`GET /api/v1/search?q=...` is served entirely by the listings service, because
`products` and `product_embeddings` are both listings-owned:

1. **SSQL validation.** The query string is pattern-checked for injection attempts and rejected with a 403 before it reaches any provider.
2. **listings → prodbert.** `POST /embed` turns the query into a 384-dimensional vector.
3. **pgvector cosine search.** `embedding <=> $1::vector` ranks `product_embeddings` by cosine distance and joins back to `products` for the ranker's columns.
4. **Hybrid re-ranking.** `0.60 × vector + 0.25 × BM25 + 0.10 × seller trust + 0.05 × recency`, with the per-signal breakdown returned alongside each result for explainability.

Every stage degrades instead of failing: if prodbert is unreachable the response
comes back with `mode: "degraded_no_embedding"`, and if the pgvector query fails
it comes back `degraded_db_error` — the caller always gets a well-formed
response with a `mode` field telling it what happened.

> **Embeddings must be backfilled before search returns anything.** A product
> with no row in `product_embeddings` is invisible to semantic search.
> `Backend/ProdBERT/backfill.mjs` embeds every product that is missing one, and
> must be re-run after seeding new products.

---

## Services

| Service | Runtime | Datastore | Responsibility |
|---------|---------|-----------|----------------|
| **Frontend SPA** | React 18 + Vite + TS | — | UI, auth flows, AI chat, cart/checkout, seller tools |
| **auth** | C# / .NET 9 (Minimal API + EF Core) | Postgres `mypal_auth` | Identity, sessions, JWT issuance, Google OAuth, profiles |
| **listings** | C# / .NET 9 | Postgres `mypal_listings` | Products, media, reviews, wishlist, seller listings, semantic search |
| **orders** | C# / .NET 9 | Postgres `mypal_orders` | Orders, cart, notifications, checkout saga, outbox, idempotency |
| **payments** | C# / .NET 9 | Postgres `mypal_orders` (shared) | Wallet balances and the transaction ledger |
| **ai** | Go 1.25 | MongoDB `mypal_ai` | Agentic LLM workflows, web-augmented search, recommendations |
| **messaging** | Go 1.25 | MongoDB `mypal_messaging` | Chat threads, support tickets, negotiation sessions |
| **prodbert** | Node 20 (ONNX) | — (stateless) | Sentence-embedding service backing semantic search |
| **cache** | Redis | — | Per-service read cache, 5 hour TTL |

> The orders service also owns the NATS JetStream event bus scaffolding (outbox,
> reconciliation, DLQ) used in the saga-based checkout design. It is optional:
> with `NATS_URL` unset the outbox still records events durably and the
> dispatcher stays off.

---

## Tech Stack

**Frontend** — React 18.3, Vite 5.4, TypeScript 5.8, Tailwind CSS 3.4, React Router 6, Zustand (state), TanStack Query, `@supabase/supabase-js`, lucide-react.

**C# services** (auth, listings, orders, payments) — .NET 9 Minimal APIs, Entity Framework Core, Npgsql, JWT (HS256) validation, cookie + Google OAuth, Swagger. Cross-cutting concerns live in the shared `MyPal.ServiceDefaults` library.

**Go services** (ai, messaging) — Go 1.25, standard `net/http` with a hand-rolled ordered middleware chain, the official MongoDB driver, `go-redis`. Cross-cutting concerns live in `internal/servicekit`.

**Embedding service** (prodbert) — Node 20 running `Xenova/paraphrase-MiniLM-L3-v2` through `@xenova/transformers` on the ONNX runtime. It runs fully locally: no Python, no torch, no API key. Its 384-dimensional output is what the `vector(384)` column in `product_embeddings` is sized for, so the query-time model and the backfill model must always match.

**AI providers** — `gemini-3.6-flash` backs every chat-shaped feature (AI search, product Q&A, recommendations, seller analytics, data cleaning). `meta-llama/Prompt-Guard-86M` via HuggingFace classification runs as the prompt-injection entry shield, and Tavily provides web-search augmentation. An unset provider key degrades that node to a deterministic mock rather than failing the request.

**Data & Infra** — PostgreSQL with the `pgvector` extension (three databases), MongoDB (two databases), Redis, optional NATS JetStream, Docker for the backend services, Vercel for the frontend.

---

## Security Model

MyPal uses a **zero-trust, defense-in-depth** design:

- **Identity is token-derived, not client-claimed.** Every service strips inbound `X-User-*` headers and only sets them *after* verifying the JWT itself, so handler code can trust them. Only the auth service issues tokens; the rest validate with the shared HS256 secret.
- **Internal-service gate.** The `/internal/*` routes services call on each other (product resolution, stock decrement, catalogue reads) require a shared `X-Internal-Token` and carry no end-user token, so they are unreachable from the browser.
- **Password hashing.** Credentials are stored as salted **PBKDF2-SHA256** hashes; login verification is constant-time.
- **Prompt-injection shield.** User text bound for an LLM is first classified by `Prompt-Guard-86M`; the classifier falls back to a local heuristic rather than failing open when `HUGGING_FACE_API_KEY` is unset.
- **Search input validation.** Search queries are pattern-checked (`SsqlSanitizer`) and rejected before embedding or hitting Postgres. The pgvector query itself is fully parameterised.
- **Ownership enforcement.** A user can only edit or delete the products they created.
- **Transactional integrity.** Checkout validates/decrements stock, computes the wallet/COD split via a DB trigger, and records a ledger entry — all in one transaction.
- **Token handling.** Short-lived access tokens live in memory; refresh tokens are persisted to survive reloads across browsers (including mobile Safari), with httpOnly-cookie support where available.

---

## Data Layer

Each service owns its own database. Nothing reaches into another service's tables.

- **`mypal_auth`** (auth) — `users`, `user_algorithm_steering`, `life_track_history`.
- **`mypal_listings`** (listings) — `products`, `product_media`, `product_attributes`, `product_reviews`, `wishlist_items`, `vendors`, `seller_performance_summaries`, and `product_embeddings` (pgvector).
- **`mypal_orders`** (orders + payments) — `orders`, `order_items`, `carts`, `cart_items`, `notifications`, `wallets`, `transactions`, plus the distributed-systems state: `saga_states`, `saga_steps`, `outbox_events`, `processed_events`, `api_idempotency`.
- **`mypal_ai`** (ai, MongoDB) — `agent_execution_traces`, `agentic_validation_logs`, `user_searches`, `ai_feature_history`, `global_search_quota`.
- **`mypal_messaging`** (messaging, MongoDB) — `chat_threads`, `support_tickets`, `negotiation_sessions`.
- **Server-side rules** — a `process_wallet_payment` trigger computes the wallet vs. cash-on-delivery split and debits `wallets` authoritatively (clients cannot manipulate payment amounts); `updated_at` triggers enforce invariants.

Foreign keys that used to cross these boundaries (`orders.user_id`, `products.created_by`, `wishlist_items.user_id`) survive as plain ID columns.

---

## Local Development

Copy `.env.example` to `.env` and fill it in first — every path below reads it.

**The one-command path** is `dev-up.sh`, which starts prodbert, all six backend
services and the Vite dev server, waits for each health check, and tears the
whole set down on `Ctrl+C`:

```bash
./dev-up.sh                 # http://localhost:5173
```

It assumes Postgres, MongoDB and Redis are reachable at the URLs in `.env`
(cloud-hosted is fine — nothing local is started for them). Logs land in
`.dev-logs/`.

**Docker Compose** brings up the full stack including Postgres (with the three
databases created for you), MongoDB, Redis, NATS and prodbert:

```bash
cd deployments
docker compose up --build
```

**Or run them on the host by hand.** Start prodbert first — the listings service
needs it to embed search queries, and without it search returns
`degraded_no_embedding`:

```bash
# 1. Embedding service (first run downloads the ONNX model, ~1 min)
cd Backend/ProdBERT && npm install && npm start        # :8001

# 2. Frontend
cd Frontend && npm install && npm run dev              # http://localhost:5173

# 3. C# services — auth first, then orders before payments
#    (orders owns the shared mypal_orders schema and runs its migrations)
cd Backend/CSharp/MyPal.Auth     && PORT=5000 dotnet run
cd Backend/CSharp/MyPal.Listings && PORT=5002 dotnet run
cd Backend/CSharp/MyPal.Orders   && PORT=5004 dotnet run
cd Backend/CSharp/MyPal.Payments && PORT=5005 dotnet run

# 4. Go services — ai before messaging (messaging calls it for chat replies)
cd Backend/Go
PORT=5003 go run ./cmd/ai
PORT=5001 go run ./cmd/messaging
```

Leave the frontend's `VITE_*_URL` vars empty in local dev: requests then use
relative paths and the Vite proxy in `Frontend/vite.config.ts` routes each one to
the right port. All six services must share the same `JWT_SECRET` (so tokens the
auth service issues validate everywhere) and the same `INTERNAL_SERVICE_TOKEN`
(for the service-to-service `/internal/*` routes).

Applying migrations:

```bash
cd Backend/CSharp/MyPal.Auth     && dotnet ef database update
cd Backend/CSharp/MyPal.Listings && dotnet ef database update
cd Backend/CSharp/MyPal.Orders   && dotnet ef database update   # also creates payments' tables
```

Then backfill the product embeddings, without which semantic search matches
nothing (prodbert must already be running):

```bash
cd Backend/ProdBERT
LISTINGS_POSTGRES_URL=postgresql://... PRODBERT_URL=http://localhost:8001 node backfill.mjs
```

> `start-backend.ps1` is a *different* tool: it is the Windows startup-folder
> script that runs the six services behind per-service cloudflared tunnels. It
> does not start prodbert or the frontend — use `dev-up.sh` for development.

---

## Repository Layout

```
MyPal/
├── Frontend/                     # React + Vite SPA (deployed to Vercel)
├── Backend/
│   ├── CSharp/
│   │   ├── MyPal.ServiceDefaults/  # Shared: JWT, CORS, Redis cache, internal auth
│   │   ├── MyPal.Auth/             # auth service       → mypal_auth
│   │   ├── MyPal.Listings/         # listings service   → mypal_listings
│   │   ├── MyPal.Orders/           # orders service     → mypal_orders
│   │   └── MyPal.Payments/         # payments service   → mypal_orders (shared)
│   ├── Go/
│   │   ├── cmd/ai/                 # ai service         → MongoDB mypal_ai
│   │   ├── cmd/messaging/          # messaging service  → MongoDB mypal_messaging
│   │   ├── internal/servicekit/    # Shared: JWT, CORS, Redis cache
│   │   └── internal/{ai,messaging}/
│   ├── ProdBERT/                   # prodbert embedding service (stateless)
│   │   ├── server.mjs              #   POST /embed — the query-time model
│   │   └── backfill.mjs            #   one-off product embedding backfill
│   └── migrations/                 # Legacy SQL migrations
├── deployments/                  # docker-compose + Postgres bootstrap
├── shared/contracts/             # DTOs shared across Go, C# and the frontend
├── supabase/                     # Supabase config
├── docs/                         # Architecture & implementation notes
└── dev-up.sh                     # One-command local stack
```

---

*MyPal is a demo-grade marketplace: wallet funds are simulated but fully persisted, so the complete buy/sell/checkout experience behaves like the real thing.*
