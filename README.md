# MyPal — AI-Native Commerce Platform

**MyPal** is a mobile-first, AI-native marketplace where every account is both a **buyer and a seller**. Users discover products through natural-language AI search, list their own items in seconds, pay from an in-app wallet, and check out through a resilient, event-driven backend.

### 🔗 Live App: **[mypal-eta.vercel.app](https://mypal-eta.vercel.app)**

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

MyPal is a **distributed, polyglot, AI-native platform**. The browser never talks to a service directly — every call flows through a Supabase edge proxy into a zero-trust Go API Gateway, which validates identity and fans out to the language-specialized services best suited to each job.

```
                                ┌─────────────────────────────┐
                                │   React SPA  (Vercel)       │
                                │   mypal-eta.vercel.app      │
                                └──────────────┬──────────────┘
                                               │ HTTPS (Bearer access token)
                                               ▼
                              ┌────────────────────────────────────┐
                              │  Supabase Edge Function             │
                              │  "gateway-proxy" (Deno)             │
                              │  resolves gateway_url, forwards     │
                              └──────────────┬─────────────────────┘
                                               │
                                               ▼
        ┌──────────────────────────────────────────────────────────────────────┐
        │                  Go API Gateway  (HF Space: mypal-gateway)            │
        │  CORS · CorrelationID · Logging · PanicRecovery · JWT Validation ·    │
        │  SSQL Validation · Rate Limiting · Idempotency · Timeout · Proxy      │
        │  ── injects trusted X-User-* + X-Internal-Token to upstreams ──       │
        └───────┬────────────────────────┬─────────────────────────┬───────────┘
                │                        │                         │
                ▼                        ▼                         ▼
   ┌─────────────────────┐  ┌──────────────────────┐   ┌─────────────────────────┐
   │  C# Main API        │  │  Node Orchestrator   │   │  Semantic Search /      │
   │  (HF: mypal-csharp) │  │  (HF: mypal-node)    │   │  Saga / Checkout        │
   │  .NET 9             │  │  Express + LLMs      │   │  (in-gateway, Go)       │
   │                     │  │                      │   │                         │
   │  auth · users ·     │  │  deep/fast search ·  │   │  pgvector matching ·    │
   │  products · orders ·│  │  recommend · ask ·   │   │  hybrid ranking ·       │
   │  cart · wallet ·    │  │  translate ·         │   │  checkout orchestration │
   │  wishlist · notifs  │  │  summarize · clean · │   │  · outbox/reconciliation│
   │                     │  │  seller-analyze      │   │                         │
   └──────────┬──────────┘  └──────────┬───────────┘   └────────────┬────────────┘
              │                        │                            │
              └────────────────────────┴────────────────────────────┘
                                       │
                                       ▼
                       ┌────────────────────────────────────┐
                       │  Supabase PostgreSQL + pgvector     │
                       │  users · products · orders · cart · │
                       │  wallet/transactions · embeddings · │
                       │  saga_states · outbox_events …      │
                       │  (wallet-payment trigger, RLS)      │
                       └────────────────────────────────────┘
```

---

## Request Lifecycle

A typical authenticated call — e.g. placing an order:

1. **SPA → Edge Proxy.** The React app sends the request with an in-memory `Bearer` access token to the Supabase `gateway-proxy` edge function.
2. **Edge Proxy → Gateway.** The edge function looks up the current `gateway_url` and forwards the request unchanged (preserving redirects and cookies).
3. **Gateway: zero-trust validation.** The Go gateway strips any client-supplied `X-User-*` headers, validates the JWT (HS256), then **re-injects trusted** `X-User-Id`, `X-User-Roles`, `X-User-Email` plus an `X-Internal-Token`. Rate limiting, idempotency, request-size and timeout budgets are applied here.
4. **Gateway → C#.** The order request is proxied to the .NET API, which trusts only the gateway-injected identity headers and the internal token.
5. **C# → PostgreSQL (transaction).** Stock is validated and decremented, the order is inserted (a DB trigger computes the wallet/COD split and debits the wallet), a `Purchase` ledger row is written, and the cart is cleared — all atomically.
6. **Response envelope.** The gateway normalizes every upstream response into a consistent `{ success, data, error, trace_id }` envelope back to the SPA.

AI calls (`/api/v1/ai/...`) follow the same path but fan out to the Node orchestrator, which calls the appropriate LLM/search provider and streams structured results back.

---

## Services

| Service | Runtime | Hosting | Responsibility |
|---------|---------|---------|----------------|
| **Frontend SPA** | React 18 + Vite + TS | Vercel | UI, auth flows, AI chat, cart/checkout, seller tools |
| **Edge Proxy** | Deno (Supabase Edge Function) | Supabase | Stable public entrypoint → resolves and forwards to the gateway |
| **API Gateway** | Go 1.25 | HF Space `mypal-gateway` | Zero-trust auth, routing, rate limiting, idempotency, semantic search, checkout saga |
| **Main API** | C# / .NET 9 (Minimal API + EF Core) | HF Space `mypal-csharp` | Auth, users, products, orders, cart, wallet, wishlist, notifications |
| **AI Orchestrator** | Node.js + Express | HF Space `mypal-node` | Agentic LLM workflows and web-augmented search |
| **Database** | PostgreSQL + pgvector | Supabase | System of record, embeddings, saga/outbox state, RLS |

> The gateway also contains scaffolding for a Go support/realtime service and NATS JetStream event bus (outbox, reconciliation, DLQ, compensation) used in the saga-based checkout design.

---

## Tech Stack

**Frontend** — React 18.3, Vite 5.4, TypeScript 5.8, Tailwind CSS 3.4, React Router 6, Zustand (state), TanStack Query, `@supabase/supabase-js`, lucide-react.

**Gateway** — Go 1.25, standard `net/http` with a hand-rolled ordered middleware chain, pgx connection pool, optional NATS JetStream.

**Main API** — C# / .NET 9 Minimal APIs, Entity Framework Core, Npgsql, JWT (HS256) auth, cookie + Google OAuth, Swagger.

**AI Orchestrator** — Node.js, Express, multi-provider LLM routing (Gemini, Mistral, Llama/Groq, OpenAI) with Tavily web search for augmentation.

**Data & Infra** — Supabase PostgreSQL with the `pgvector` extension, Supabase Edge Functions (Deno), Hugging Face Spaces (Docker) for the backend services, Vercel for the frontend.

---

## Security Model

MyPal uses a **zero-trust, defense-in-depth** design:

- **Identity is gateway-issued, not client-claimed.** The gateway strips inbound `X-User-*` headers and only sets them *after* verifying the JWT, so downstream services can trust them.
- **Internal-service gate.** The C# API requires a gateway-injected `X-Internal-Token` on all non-OAuth routes, so it cannot be called directly with a forged `X-User-Id`. (Google OAuth browser-redirect routes are the only exemptions.)
- **Password hashing.** Credentials are stored as salted **PBKDF2-SHA256** hashes; login verification is constant-time.
- **Ownership enforcement.** A user can only edit or delete the products they created.
- **Transactional integrity.** Checkout validates/decrements stock, computes the wallet/COD split via a DB trigger, and records a ledger entry — all in one transaction.
- **Token handling.** Short-lived access tokens live in memory; refresh tokens are persisted to survive reloads across browsers (including mobile Safari), with httpOnly-cookie support where available.

---

## Data Layer

PostgreSQL (Supabase) is the single source of truth. Notable elements:

- **Core tables** — `users`, `products`, `product_media`, `orders`, `order_items`, `carts`, `cart_items`, `transactions`, `wishlist_items`, `notifications`.
- **AI / search** — `product_embeddings` (pgvector), `user_searches`, `seller_performance_summaries`.
- **Distributed-systems state** — `saga_states`, `saga_steps`, `outbox_events`, `processed_events`, `api_idempotency`, `gateway_poison_events`.
- **Server-side rules** — a `process_wallet_payment` trigger computes the wallet vs. cash-on-delivery split and debits balances authoritatively (clients cannot manipulate payment amounts); media-count limits and `updated_at` triggers enforce invariants.

---

## Local Development

Each service runs independently. Configuration is via environment variables (see `.env.example`).

```bash
# 1. Frontend
cd Frontend
pnpm install
pnpm dev            # http://localhost:5173

# 2. Go API Gateway
cd Backend/Go
go run ./cmd/gateway        # :8081 (reads JWT_SECRET, INTERNAL_SERVICE_TOKEN, upstream URLs)

# 3. C# Main API
cd Backend/CSharp/MyPal.API
dotnet run                  # :5000

# 4. Node AI Orchestrator
cd Backend/Node
npm install
npm start                   # :5003
```

The gateway routes `/api/v1/*` to the C# API, Node orchestrator, and in-gateway search/checkout handlers. Point the frontend's `VITE_API_GATEWAY` at the gateway (or the Supabase edge proxy) and ensure the gateway and C# API share the same `INTERNAL_SERVICE_TOKEN`.

---

## Repository Layout

```
MyPal/
├── Frontend/             # React + Vite SPA (deployed to Vercel)
├── Backend/
│   ├── Go/               # API Gateway + search/saga/checkout (cmd/gateway)
│   ├── CSharp/           # .NET 9 Main API (auth, commerce domain)
│   ├── Node/             # Express AI/LLM orchestrator
│   └── migrations/       # SQL migrations
├── supabase/             # Edge functions & Supabase config
└── docs/                 # Architecture & implementation notes
```

---

*MyPal is a demo-grade marketplace: wallet funds are simulated but fully persisted, so the complete buy/sell/checkout experience behaves like the real thing.*
