# Commerce, Frontend & Scalability Architecture

## K. Multi-Vendor Commerce Architecture

### Order Splitting

A single checkout may span multiple vendors. The order is split at the Gateway orchestration layer:

```
Cart { items: [vendorA: [item1, item2], vendorB: [item3]] }
  → Create parent Order (status: PENDING)
  → Create child SubOrder per vendor
  → Reserve inventory per SubOrder
  → Process payment against parent Order total
  → On success: confirm all SubOrders
  → On failure: compensate all reservations
```

### Geo-Integrity Enforcement

At checkout, the C# API calls `order.SnapshotUserLocation(user)`:

```
order.destination_google_place_id = user.google_place_id
order.destination_lat = user.lat        -- numeric(9,6)
order.destination_lng = user.lng        -- numeric(9,6)
order.destination_address = user.city + ", " + user.state
```

**Invariant**: These fields are immutable after order creation. No UPDATE may modify `destination_*` columns.

### Inventory Reservation

1. `SELECT ... FOR UPDATE SKIP LOCKED` on inventory rows (prevents race conditions)
2. Reservation valid for 10 minutes (Redis TTL tracks expiry)
3. If payment not completed within TTL → NATS event `inventory.reservation_expired` → auto-release

### Fraud Heuristics

Checked at checkout time by the Gateway:
- Geo distance between user's current lat/lng and historical order addresses
- Velocity check: max 5 orders per hour per account
- Amount threshold: orders > $5000 require manual review flag

## L. Frontend Integration Blueprint

### API Client Architecture

```typescript
// Frontend/src/api/client.ts
const client = createApiClient({
  baseURL: env.API_GATEWAY,        // Always through gateway
  headers: { Authorization: `Bearer ${accessToken}` },
  interceptors: {
    onUnauthorized: () => refreshTokenFlow(),
    onCorrelationId: (id) => setTraceContext(id),
  },
});
```

### De-Mocking Strategy (Phased)

| Phase | Scope | Target |
|:---|:---|:---|
| **Phase 1** | Auth | Replace `authService.ts` mock → real C# Identity via Gateway |
| **Phase 2** | Search | Replace `searchService.ts` mock → real semantic search pipeline |
| **Phase 3** | Commerce | Replace `useMockStore.ts` cart/wishlist → real C# API |
| **Phase 4** | AI | Replace `AISearchScreen` mock → real Node Orchestrator |
| **Phase 5** | Realtime | Add WebSocket connection to Go Support for notifications |

### Typed Contracts

Generate TypeScript types from OpenAPI specs:

```
C# API → openapi.json → openapi-typescript → Frontend/src/types/api.ts
```

All API calls use these generated types. No `any` types in API layer.

### Optimistic UI

For cart/wishlist mutations:
1. Update local Zustand store immediately
2. Fire API call in background
3. On failure: revert local state + show toast error
4. On success: sync server response into store

### Geo Snapshot Acquisition

```typescript
// At checkout time
const location = await navigator.geolocation.getCurrentPosition();
const placeId = await googleMapsGeocode(location.lat, location.lng);
// Sent with order creation request
```

## M. Scalability Roadmap

### Horizontal Scaling Model

| Service | Scaling Strategy | Bottleneck |
|:---|:---|:---|
| Go Gateway | Stateless, horizontal behind LB | CPU (middleware processing) |
| C# Main API | Stateless, horizontal behind LB | PostgreSQL connection pool |
| Node Orchestrator | Stateless, horizontal | External LLM API rate limits |
| Python ProdBERT | GPU-aware horizontal | GPU memory / model loading |
| PostgreSQL | Read replicas + connection pooler (PgBouncer) | Write throughput |
| Redis | Cluster mode | Memory |
| NATS | Clustered JetStream | Disk I/O for persistence |

### Vector Search Scaling

- **Index**: HNSW with `m=16, ef_construction=200` (good recall/speed tradeoff)
- **Partitioning**: By product category (reduces index scan space)
- **Quantization**: Future — product quantization for 4× memory reduction
- **Separate read replica**: pgvector queries routed to dedicated read replica

### Caching Topology

```
L1: In-process (Go Gateway, 100ms TTL for hot paths)
L2: Redis (shared cache, configurable TTL per entity type)
L3: PostgreSQL (source of truth, always consistent)
```

### Kubernetes Readiness

All services are designed for containerization:
- Stateless application processes
- Configuration via environment variables
- Health endpoints for liveness/readiness probes
- Graceful shutdown handlers (drain connections)
- Horizontal Pod Autoscaler targets: CPU 70%, request latency P95

## N. Highest-Risk Architectural Areas

| Risk | Severity | Mitigation |
|:---|:---|:---|
| **Split-brain on polyglot sync** | Critical | Outbox pattern replaces manual compensation |
| **LLM provider outage** | High | Fallback chain + circuit breakers + degraded mode |
| **Semantic search latency spike** | High | Redis caching + latency budget + BM25 fallback |
| **Inventory race conditions** | High | `SELECT FOR UPDATE SKIP LOCKED` + reservation TTL |
| **JWT token theft** | High | Short expiry + refresh rotation + httpOnly cookies |
| **Regex SSQL bypass** | Critical | AST-based parser replaces regex entirely |
| **Frontend mock residue in prod** | Medium | Build-time flag eliminates mock imports |
| **NATS unavailability** | Medium | Outbox rows buffer in PG, published on recovery |
| **ProdBERT model loading time** | Medium | Model pre-loaded at startup, health check gates traffic |

## O. Migration Strategy

### Phase 1: Foundation (Weeks 1-2)
- Implement Gateway middleware chain (correlation IDs, JWT validation, SSQL AST parser)
- Wire C# Identity endpoints through Gateway
- Replace `authService.ts` mock with real auth flow
- Set up NATS JetStream

### Phase 2: Intelligence (Weeks 3-4)
- Wire semantic search pipeline (Gateway → ProdBERT → pgvector)
- Replace `searchService.ts` mock
- Implement embedding lifecycle (product create/update → re-embed event)
- Deploy hybrid ranking

### Phase 3: Commerce (Weeks 5-6)
- Implement outbox pattern in C# for order events
- Wire checkout saga via NATS
- Replace `useMockStore.ts` with real API calls
- Implement inventory reservation with `SKIP LOCKED`

### Phase 4: Orchestration (Weeks 7-8)
- Harden Node LLM orchestrator (circuit breakers, audit logging, pollution prevention)
- Implement provider fallback chain
- Replace life_track_sync manual compensation with outbox
- Deploy observability stack (OpenTelemetry + Jaeger)

### Phase 5: Production Hardening (Weeks 9-10)
- Security audit (prompt sanitization, zero-trust enforcement)
- Load testing (identify actual bottlenecks)
- Kubernetes manifest generation
- Monitoring dashboards (Grafana + Prometheus)
