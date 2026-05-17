// Package routing registers all gateway routes and applies middleware chains.
// Route groups and their middleware stacks are defined here explicitly —
// no magic auto-discovery, no hidden middleware application.
//
// Execution order per route group:
//
//	Public:   CorrelationID → Logging → PanicRecovery → RateLimit → Timeout → Observability → Proxy
//	Auth:     CorrelationID → Logging → PanicRecovery → JWTValidation → RateLimit → Timeout → Observability → Proxy
//	Search:   CorrelationID → Logging → PanicRecovery → JWTValidation → SSQLValidation → RateLimit → Timeout → Observability → SearchHandler
//	Internal: CorrelationID → Logging → PanicRecovery → InternalAuth → Timeout → Proxy
package routing

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"mypal/api/go/internal/gateway/auth"
	gconfig "mypal/api/go/internal/gateway/config"
	"mypal/api/go/internal/gateway/middleware"
	"mypal/api/go/internal/gateway/observability"
	"mypal/api/go/internal/gateway/proxy"
	"mypal/api/go/internal/gateway/responses"
	"mypal/api/go/internal/gateway/search"
	"mypal/api/go/internal/gateway/tracing"

	"github.com/jackc/pgx/v5/pgxpool"
)

const gatewayVersion = "1.0.0-phase1"

type ReadinessCheck func(ctx context.Context) error

func Register(mux *http.ServeMux, cfg *gconfig.GatewayConfig, db *pgxpool.Pool, readiness ReadinessCheck) http.Handler {
	middleware.ConfigureRateLimit(cfg.RateLimit.RequestsPerSecond, cfg.RateLimit.BurstSize)

	// Build the routes and apply the global identity header stripper.
	// This ensures no client-side spoofing can reach any upstream or internal logic.
	handler := buildRoutes(mux, cfg, db, readiness)

	return stripIdentityHeaders(handler)
}

// stripIdentityHeaders removes X-User-* headers from all incoming requests
// before the middleware chain processes them. This prevents identity spoofing.
func stripIdentityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Header.Del(auth.HeaderUserID)
		r.Header.Del(auth.HeaderUserRoles)
		r.Header.Del(auth.HeaderUserEmail)
		next.ServeHTTP(w, r)
	})
}

func buildRoutes(mux *http.ServeMux, cfg *gconfig.GatewayConfig, db *pgxpool.Pool, readiness ReadinessCheck) http.Handler {

	// --- Upstream directors ---
	csharpProxy := &proxy.Director{
		BaseURL:       cfg.Upstreams.CSharpMainAPI,
		Timeout:       cfg.Timeout.CSharpAPI,
		InternalToken: cfg.Auth.InternalServiceToken,
	}
	nodeProxy := &proxy.Director{
		BaseURL:       cfg.Upstreams.NodeOrchestrator,
		Timeout:       cfg.Timeout.NodeOrchestrator,
		InternalToken: cfg.Auth.InternalServiceToken,
	}
	supportProxy := &proxy.Director{
		BaseURL:       cfg.Upstreams.GoSupportService,
		Timeout:       cfg.Timeout.GoSupport,
		InternalToken: cfg.Auth.InternalServiceToken,
	}

	// --- Middleware stacks ---
	base := middleware.Chain(
		middleware.CorrelationID,
		middleware.StructuredLogging,
		middleware.PanicRecovery,
		middleware.RateLimiting,
		middleware.Timeout(cfg.Timeout.Default),
		middleware.Observability,
		middleware.RequestSizeLimit(cfg.MaxBodyBytes),
	)

	authenticated := middleware.Chain(
		middleware.CorrelationID,
		middleware.StructuredLogging,
		middleware.PanicRecovery,
		middleware.JWTValidation(cfg.Auth.JWTSecret),
		middleware.RateLimiting,
		middleware.Idempotency(db),
		middleware.Timeout(cfg.Timeout.Default),
		middleware.Observability,
		middleware.RequestSizeLimit(cfg.MaxBodyBytes),
	)

	searchStack := middleware.Chain(
		middleware.CorrelationID,
		middleware.StructuredLogging,
		middleware.PanicRecovery,
		middleware.JWTValidation(cfg.Auth.JWTSecret),
		middleware.SSQLValidation,
		middleware.RateLimiting,
		middleware.Timeout(cfg.Timeout.ProdBERT+cfg.Timeout.Default),
		middleware.Observability,
		middleware.RequestSizeLimit(cfg.MaxBodyBytes),
	)

	internalStack := middleware.Chain(
		middleware.CorrelationID,
		middleware.StructuredLogging,
		middleware.PanicRecovery,
		middleware.InternalAuth(cfg.Auth.InternalServiceToken),
		middleware.Timeout(cfg.Timeout.Default),
	)

	// ----------------------------------------------------------------
	// Gateway meta routes (no upstream proxy)
	// ----------------------------------------------------------------

	// Simple liveness check.
	mux.Handle("GET /health", base(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		responses.OK(w, map[string]string{"status": "ok", "version": gatewayVersion})
	})))

	mux.Handle("GET /ready", base(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())
		if readiness == nil {
			responses.Error(w, http.StatusServiceUnavailable, "NOT_READY", "readiness check is not configured", traceID)
			return
		}

		readyCtx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := readiness(readyCtx); err != nil {
			responses.Error(w, http.StatusServiceUnavailable, "NOT_READY", fmt.Sprintf("gateway is not ready: %v", err), traceID)
			return
		}

		responses.OK(w, map[string]string{"status": "ready", "version": gatewayVersion})
	})))

	// Aggregated dependency health check.
	mux.Handle("GET /health/dependencies", base(
		observability.Handler(gatewayVersion, []observability.Dependency{
			{Name: "csharp-main-api", HealthURL: cfg.Upstreams.CSharpMainAPI + "/", Timeout: 3 * time.Second},
			{Name: "go-support", HealthURL: cfg.Upstreams.GoSupportService + "/health", Timeout: 3 * time.Second},
			{Name: "node-orchestrator", HealthURL: cfg.Upstreams.NodeOrchestrator + "/health", Timeout: 3 * time.Second},
			{Name: "python-prodbert", HealthURL: cfg.Upstreams.PythonProdBERT + "/health", Timeout: 3 * time.Second},
		}),
	))

	// ----------------------------------------------------------------
	// Auth routes → C# Main API  (public, no JWT required)
	// Maps /api/v1/auth/login -> /api/auth/login on C#
	// ----------------------------------------------------------------
	mux.Handle("/api/v1/auth/", base(csharpProxy.Handler("/api/v1")))

	// ----------------------------------------------------------------
	// User & profile routes → C# Main API  (authenticated)
	// ----------------------------------------------------------------
	mux.Handle("/api/v1/users/", authenticated(csharpProxy.Handler("/api/v1")))

	// ----------------------------------------------------------------
	// Products & inventory → C# Main API  (authenticated)
	// ----------------------------------------------------------------
	mux.Handle("/api/v1/products/", authenticated(csharpProxy.Handler("/api/v1")))

	// ----------------------------------------------------------------
	// Orders & checkout → C# Main API  (authenticated)
	// ----------------------------------------------------------------
	mux.Handle("/api/v1/orders/", authenticated(csharpProxy.Handler("/api/v1")))

	// ----------------------------------------------------------------
	// Semantic Search (orchestrated)  → searchStack → ProdBERT + pgvector
	// ----------------------------------------------------------------
	searchCfg := search.Config{
		ProdBERTURL:   cfg.Upstreams.PythonProdBERT,
		InternalToken: cfg.Auth.InternalServiceToken,
		EmbedTimeout:  cfg.Timeout.ProdBERT,
		DBPool:        db,
	}
	mux.Handle("GET /api/v1/search", searchStack(search.Handler(searchCfg)))
	mux.Handle("POST /api/v1/search", searchStack(search.Handler(searchCfg)))

	// ----------------------------------------------------------------
	// AI & LLM Orchestration → Node Orchestrator  (authenticated)
	// ----------------------------------------------------------------
	mux.Handle("/api/v1/ai/", authenticated(nodeProxy.Handler("/api/v1/ai")))
	mux.Handle("/api/v1/seller/report/", authenticated(nodeProxy.Handler("/api/v1")))
	mux.Handle("/api/v1/seller-report/", authenticated(nodeProxy.Handler("/api/v1")))
	mux.Handle("/api/v1/seller/listing/", authenticated(nodeProxy.Handler("/api/v1")))

	// ----------------------------------------------------------------
	// Support / realtime → Go Support  (authenticated)
	// ----------------------------------------------------------------
	mux.Handle("/api/v1/support/", authenticated(supportProxy.Handler("/api/v1/support")))

	// ----------------------------------------------------------------
	// Internal service-to-service routes (internal token only)
	// ----------------------------------------------------------------
	mux.Handle("/internal/support/", internalStack(supportProxy.Handler("/internal/support")))

	// ----------------------------------------------------------------
	// SSQL validation pass-through (for backward compat with Go Support)
	// ----------------------------------------------------------------
	mux.Handle("GET /internal/validate-ssql", internalStack(
		supportProxy.Handler("/validate-ssql"),
	))

	// ----------------------------------------------------------------
	// Catch-all 404
	// ----------------------------------------------------------------
	mux.Handle("/", base(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())
		responses.Error(w, http.StatusNotFound, "NOT_FOUND",
			"no route matched "+r.URL.Path, traceID)
	})))

	// Return a no-op handler; real routes are registered on the mux above.
	_ = strings.ToLower // import anchor
	return mux
}
