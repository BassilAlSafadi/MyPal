# Identity, Security & Reliability Architecture

## H. Unified Identity Architecture

### Model

One account, two roles. A user may act as `buyer`, `seller`, or both simultaneously.

```
public.users (
  id UUID PK,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  roles TEXT[] DEFAULT '{buyer}',  -- e.g. '{buyer,seller}'
  ...
)
```

### JWT Architecture

- **Access Token**: 15 min expiry, signed with `JWT_SECRET`, contains `{ sub, email, roles[], iat, exp }`
- **Refresh Token**: Long-lived sliding session, signed with `JWT_REFRESH_SECRET`, stored in an `httpOnly` cookie and mirrored to localStorage for browsers that block cross-site cookies
- **Rotation**: Every refresh rotates both tokens and extends the session. Users should only need to authenticate again after explicit logout or local browser storage removal
- **Revocation**: Redis set `revoked_tokens` checked on every JWT validation at Gateway

### Auth Flow

```
1. Frontend → POST /api/v1/auth/login → Gateway → C# API
2. C# validates credentials → issues JWT + refresh token
3. Gateway sets refresh token as httpOnly cookie
4. Frontend stores access token in memory and persists the refresh token for cross-browser session restoration
5. On 401 → Frontend calls /api/v1/auth/refresh → Gateway → C# rotates tokens
```

### OAuth2 (Google)

```
1. Frontend → GET /api/v1/auth/google → Gateway → C# → Google redirect
2. Google callback → C# /api/auth/google/callback → upsert user → issue JWT
3. Gateway sets tokens as above
```

### RBAC Enforcement

Gateway middleware extracts `roles[]` from JWT and enforces:

| Route Pattern | Required Role |
|:---|:---|
| `/api/v1/orders/create` | `buyer` |
| `/api/v1/products/create` | `seller` |
| `/api/v1/seller-report/*` | `seller` |
| `/api/v1/admin/*` | `admin` |

## I. Security Architecture

### Defense Layers

| Layer | Implementation |
|:---|:---|
| **Network** | Gateway-only external access. Internal services on Docker private network. |
| **Authentication** | JWT with short expiry + refresh rotation |
| **Authorization** | RBAC at Gateway middleware |
| **Input Validation** | AST-based SSQL validation (replaces regex) |
| **Service Auth** | `INTERNAL_SERVICE_TOKEN` header on all inter-service calls |
| **AI Safety** | Prompt sanitization before LLM calls. Output validation before PG writes. |
| **Audit** | All mutations logged to MongoDB with correlation IDs |
| **CSRF** | Double-submit cookie pattern for state-changing requests |

### AI Prompt Sanitization

Before any user content is interpolated into an LLM prompt:
1. Strip HTML/script tags
2. Truncate to maximum safe length (2000 chars)
3. Escape template delimiters
4. Log sanitized input to MongoDB audit

### Zero-Trust Principles

- No service trusts any other service by default
- Every inter-service call validated via `INTERNAL_SERVICE_TOKEN`
- Gateway re-validates JWT on every request (no session stickiness)
- Database credentials are per-service, least-privilege

## J. Reliability Architecture

### Circuit Breakers

| Target | Threshold | Reset |
|:---|:---|:---|
| Gemini API | 5 failures / 60s | Half-open after 30s |
| Cohere API | 5 failures / 60s | Half-open after 30s |
| ProdBERT | 3 failures / 30s | Half-open after 15s |
| PostgreSQL | 3 failures / 10s | Half-open after 5s |

### Timeout Strategy

| Call Type | Timeout |
|:---|:---|
| Gateway → C# | 5s |
| Gateway → ProdBERT | 3s |
| Gateway → Node | 15s (LLM calls) |
| Node → Gemini/Cohere | 10s |
| Node → ProdBERT | 3s |
| Any → PostgreSQL | 5s |
| Any → Redis | 1s |
| Any → MongoDB | 3s |

### Observability Stack

- **Metrics**: Prometheus (service latencies, error rates, queue depths)
- **Traces**: OpenTelemetry with Jaeger (distributed correlation IDs)
- **Logs**: Structured JSON logs, aggregated via stdout → collector
- **Health**: Every service exposes `/health` with dependency status

### Graceful Degradation

| Failure | Degraded Behavior |
|:---|:---|
| ProdBERT down | Fall back to BM25-only keyword search |
| LLM providers down | Return "analysis pending" + queue for retry |
| Redis down | Bypass cache, read from PostgreSQL directly |
| MongoDB down | Buffer audit events in memory, flush on recovery |
| NATS down | Outbox rows accumulate in PostgreSQL, published on recovery |
