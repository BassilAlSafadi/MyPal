// Package routing registers all gateway routes and applies middleware chains.
// C# uses same-container gRPC; Node.js and Go Support use HTTP proxying.
// The public surface stays REST/JSON.
//
// Execution order per route group:
//
//	Public:   CorrelationID -> Logging -> PanicRecovery -> RateLimit -> Timeout -> Observability -> handler
//	Auth:     CorrelationID -> Logging -> PanicRecovery -> JWTValidation -> RateLimit -> Timeout -> Observability -> handler
//	Search:   CorrelationID -> Logging -> PanicRecovery -> JWTValidation -> SSQLValidation -> RateLimit -> Timeout -> Observability -> SearchHandler
//	Internal: CorrelationID -> Logging -> PanicRecovery -> InternalAuth -> Timeout -> proxy
package routing

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"mypal/api/go/internal/gateway/auth"
	"mypal/api/go/internal/gateway/checkout"
	gconfig "mypal/api/go/internal/gateway/config"
	"mypal/api/go/internal/gateway/grpcclient"
	"mypal/api/go/internal/gateway/middleware"
	"mypal/api/go/internal/gateway/observability"
	"mypal/api/go/internal/gateway/proxy"
	"mypal/api/go/internal/gateway/responses"
	"mypal/api/go/internal/gateway/saga"
	"mypal/api/go/internal/gateway/search"
	"mypal/api/go/internal/gateway/tracing"
)

const gatewayVersion = "1.0.0-phase2-grpc"

type ReadinessCheck func(ctx context.Context) error

// Register wires all routes and returns the root handler.
func Register(
	mux *http.ServeMux,
	cfg *gconfig.GatewayConfig,
	db *pgxpool.Pool,
	readiness ReadinessCheck,
	csharp *grpcclient.CSharpConn,
) http.Handler {
	middleware.ConfigureRateLimit(cfg.RateLimit.RequestsPerSecond, cfg.RateLimit.BurstSize)

	RegisterSwagger(mux)

	handler := buildRoutes(mux, cfg, db, readiness, csharp)
	return middleware.CORS(cfg.CORS.AllowedOrigins)(stripIdentityHeaders(handler))
}

func stripIdentityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Header.Del(auth.HeaderUserID)
		r.Header.Del(auth.HeaderUserRoles)
		r.Header.Del(auth.HeaderUserEmail)
		next.ServeHTTP(w, r)
	})
}

func buildRoutes(
	mux *http.ServeMux,
	cfg *gconfig.GatewayConfig,
	db *pgxpool.Pool,
	readiness ReadinessCheck,
	csharp *grpcclient.CSharpConn,
) http.Handler {
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

	// ── Middleware stacks ─────────────────────────────────────────────────────
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

	// AI/LLM routes run long agentic pipelines — generous timeout budget.
	aiAuthenticated := middleware.Chain(
		middleware.CorrelationID,
		middleware.StructuredLogging,
		middleware.PanicRecovery,
		middleware.JWTValidation(cfg.Auth.JWTSecret),
		middleware.RateLimiting,
		middleware.Timeout(cfg.Timeout.NodeOrchestrator),
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

	// Shorthand helpers.
	cs := csharp.Conn()
	csUp := csharp.Upstream()
	csTok := csharp.InternalToken()

	// ── Gateway meta ──────────────────────────────────────────────────────────

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

	mux.Handle("GET /health/dependencies", base(
		observability.Handler(gatewayVersion, []observability.Dependency{
			{Name: "csharp-main-api", HealthURL: cfg.Upstreams.CSharpMainAPI + "/", Timeout: 3 * time.Second},
			{Name: "go-support", HealthURL: cfg.Upstreams.GoSupportService + "/health", Timeout: 3 * time.Second},
			{Name: "node-orchestrator", HealthURL: cfg.Upstreams.NodeOrchestrator + "/health", Timeout: 3 * time.Second},
			{Name: "go-embed", HealthURL: cfg.Upstreams.PythonProdBERT + "/health", Timeout: 3 * time.Second},
		}),
	))

	// ── Auth routes → C# (gRPC) ───────────────────────────────────────────────
	// Login / signup / refresh / logout are public; bootstrap-session is authenticated.
	// Google OAuth must stay as HTTP proxy — it drives browser redirects.

	mux.Handle("POST /api/v1/auth/login", base(
		grpcclient.Handler(cs, csUp, grpcclient.AuthLogin, csTok)))

	mux.Handle("POST /api/v1/auth/signup", base(
		grpcclient.Handler(cs, csUp, grpcclient.AuthSignup, csTok)))

	mux.Handle("POST /api/v1/auth/refresh", base(
		grpcclient.Handler(cs, csUp, grpcclient.AuthRefresh, csTok)))

	mux.Handle("POST /api/v1/auth/logout", base(
		grpcclient.Handler(cs, csUp, grpcclient.AuthLogout, csTok)))

	mux.Handle("POST /api/v1/auth/bootstrap-session", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.AuthBootstrapSession, csTok)))

	// Google OAuth: browser redirect flow — must remain plain HTTP proxy.
	oauthProxy := &proxy.Director{
		BaseURL:       cfg.Upstreams.CSharpMainAPI,
		Timeout:       cfg.Timeout.CSharpAPI,
		InternalToken: cfg.Auth.InternalServiceToken,
	}
	mux.Handle("/api/auth/google/", base(oauthProxy.Handler("")))

	// ── User routes → C# (gRPC) ───────────────────────────────────────────────

	mux.Handle("GET /api/v1/users/me", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.UserGetMe, csTok)))

	mux.Handle("PUT /api/v1/users/me", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.UserUpdateMe, csTok)))

	mux.Handle("PATCH /api/v1/users/me/location", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.UserUpdateLocation, csTok)))

	// ── Product routes → C# (gRPC) ───────────────────────────────────────────

	mux.Handle("GET /api/v1/products", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.ProductList, csTok)))

	mux.Handle("POST /api/v1/products", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.ProductCreate, csTok)))

	mux.Handle("GET /api/v1/products/{id}", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.ProductGet, csTok, "id")))

	mux.Handle("PUT /api/v1/products/{id}", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.ProductUpdate, csTok, "id")))

	mux.Handle("DELETE /api/v1/products/{id}", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.ProductDelete, csTok, "id")))

	// ── Order routes → C# (gRPC) ─────────────────────────────────────────────

	mux.Handle("GET /api/v1/orders", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.OrderList, csTok)))

	mux.Handle("POST /api/v1/orders", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.OrderCreate, csTok)))

	mux.Handle("GET /api/v1/orders/{id}", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.OrderGet, csTok, "id")))

	// ── Cart routes → C# (gRPC) ──────────────────────────────────────────────

	mux.Handle("GET /api/v1/cart", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.CartGet, csTok)))

	mux.Handle("POST /api/v1/cart/items", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.CartAddItem, csTok)))

	mux.Handle("DELETE /api/v1/cart/items/{productId}", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.CartRemoveItem, csTok, "productId")))

	// ── Wallet routes → C# (gRPC) ────────────────────────────────────────────

	mux.Handle("GET /api/v1/wallet", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.WalletGet, csTok)))

	mux.Handle("GET /api/v1/wallet/transactions", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.WalletTransactions, csTok)))

	mux.Handle("POST /api/v1/wallet/deposit", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.WalletDeposit, csTok)))

	mux.Handle("POST /api/v1/wallet/withdraw", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.WalletWithdraw, csTok)))

	// ── Wishlist routes → C# (gRPC) ──────────────────────────────────────────

	mux.Handle("GET /api/v1/wishlist", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.WishlistGet, csTok)))

	mux.Handle("POST /api/v1/wishlist", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.WishlistAdd, csTok)))

	mux.Handle("DELETE /api/v1/wishlist/{productId}", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.WishlistRemove, csTok, "productId")))

	// ── Listings → C# (gRPC) ─────────────────────────────────────────────────

	mux.Handle("GET /api/v1/listings", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.ListingGet, csTok)))

	// ── Notifications → C# (gRPC) ────────────────────────────────────────────

	mux.Handle("GET /api/v1/notifications", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.NotifGet, csTok)))

	mux.Handle("PATCH /api/v1/notifications/{id}/read", authenticated(
		grpcclient.Handler(cs, csUp, grpcclient.NotifMarkRead, csTok, "id")))

	// ── Checkout saga (Go-native, unchanged) ──────────────────────────────────

	mux.Handle("POST /api/v1/checkout/orchestrate", authenticated(checkout.Handler(db)))
	mux.Handle("GET /api/v1/sagas/{saga_id}/status", authenticated(saga.StatusHandler(db)))

	// ── Semantic search (Go-native, unchanged) ────────────────────────────────

	searchCfg := search.Config{
		ProdBERTURL:   cfg.Upstreams.PythonProdBERT,
		InternalToken: cfg.Auth.InternalServiceToken,
		EmbedTimeout:  cfg.Timeout.ProdBERT,
		DBPool:        db,
	}
	mux.Handle("GET /api/v1/search", searchStack(search.Handler(searchCfg)))
	mux.Handle("POST /api/v1/search", searchStack(search.Handler(searchCfg)))

	// Agentic AI specific endpoints -> Node HTTP proxy.

	mux.Handle("POST /api/v1/ai/agentic/deep-search", aiAuthenticated(
		nodeProxy.HandlerWithRewrite("/api/v1/ai/agentic", "/ai")))

	mux.Handle("POST /api/v1/ai/agentic/fast-search", aiAuthenticated(
		nodeProxy.HandlerWithRewrite("/api/v1/ai/agentic", "/ai")))

	mux.Handle("POST /api/v1/ai/agentic/translate", aiAuthenticated(
		nodeProxy.HandlerWithRewrite("/api/v1/ai/agentic", "/ai")))

	mux.Handle("POST /api/v1/ai/agentic/summarize", aiAuthenticated(
		nodeProxy.HandlerWithRewrite("/api/v1/ai/agentic", "/ai")))

	mux.Handle("POST /api/v1/ai/agentic/recommend", aiAuthenticated(
		nodeProxy.HandlerWithRewrite("/api/v1/ai/agentic", "/ai")))

	mux.Handle("POST /api/v1/ai/agentic/product-ask", aiAuthenticated(
		nodeProxy.HandlerWithRewrite("/api/v1/ai/agentic/product-ask", "/ai/product/ask")))

	mux.Handle("POST /api/v1/ai/agentic/clean", aiAuthenticated(
		nodeProxy.HandlerWithRewrite("/api/v1/ai/agentic/clean", "/ai/scraped/clean")))

	mux.Handle("POST /api/v1/ai/agentic/seller-analyze", aiAuthenticated(
		nodeProxy.HandlerWithRewrite("/api/v1/ai/agentic/seller-analyze", "/ai/seller/analyze")))

	// AI quota endpoints
	mux.Handle("GET /api/v1/ai/agentic/deep-search/quota", aiAuthenticated(
		nodeProxy.HandlerWithRewrite("/api/v1/ai/agentic", "/ai")))

	mux.Handle("GET /api/v1/ai/agentic/global-search/quota", aiAuthenticated(
		nodeProxy.HandlerWithRewrite("/api/v1/ai/agentic", "/ai")))

	// Node.js Orchestrator routes -> HTTP proxy.

	mux.Handle("/api/v1/ai/summaries/", aiAuthenticated(
		nodeProxy.HandlerWithRewrite("/api/v1/ai", "")))
	mux.Handle("/api/v1/ai/", aiAuthenticated(
		nodeProxy.Handler("/api/v1")))
	mux.Handle("/api/v1/agent/", aiAuthenticated(
		nodeProxy.Handler("/api/v1")))
	mux.Handle("/api/v1/seller/", aiAuthenticated(
		nodeProxy.Handler("/api/v1")))
	mux.Handle("/api/v1/seller-report/", aiAuthenticated(
		nodeProxy.Handler("/api/v1")))

	// Go Support routes -> HTTP proxy.
	mux.Handle("/api/v1/support/", authenticated(
		supportProxy.HandlerWithRewrite("/api/v1/support", "/api")))
	mux.Handle("/internal/support/", internalStack(
		supportProxy.Handler("/internal/support")))
	mux.Handle("GET /internal/validate-ssql", internalStack(
		supportProxy.Handler("/internal")))

	// Catch-all 404.
	mux.Handle("/", base(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())
		responses.Error(w, http.StatusNotFound, "NOT_FOUND",
			"no route matched "+r.URL.Path, traceID)
	})))

	return mux
}
