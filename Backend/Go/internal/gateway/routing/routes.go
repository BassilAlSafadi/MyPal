// Package routing registers all gateway routes and applies middleware chains.
// Internal backend communication uses gRPC; the public surface stays REST/JSON.
//
// Execution order per route group:
//
//	Public:   CorrelationID → Logging → PanicRecovery → RateLimit → Timeout → Observability → gRPC handler
//	Auth:     CorrelationID → Logging → PanicRecovery → JWTValidation → RateLimit → Timeout → Observability → gRPC handler
//	Search:   CorrelationID → Logging → PanicRecovery → JWTValidation → SSQLValidation → RateLimit → Timeout → Observability → SearchHandler
//	Internal: CorrelationID → Logging → PanicRecovery → InternalAuth → Timeout → gRPC handler
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
// csharp, node, support carry the gRPC connections to each backend.
func Register(
	mux *http.ServeMux,
	cfg *gconfig.GatewayConfig,
	db *pgxpool.Pool,
	readiness ReadinessCheck,
	csharp *grpcclient.CSharpConn,
	node *grpcclient.NodeConn,
	support *grpcclient.SupportConn,
) http.Handler {
	middleware.ConfigureRateLimit(cfg.RateLimit.RequestsPerSecond, cfg.RateLimit.BurstSize)

	RegisterSwagger(mux)

	handler := buildRoutes(mux, cfg, db, readiness, csharp, node, support)
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
	node *grpcclient.NodeConn,
	support *grpcclient.SupportConn,
) http.Handler {

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

	nd := node.Conn()
	ndUp := node.Upstream()
	ndTok := node.InternalToken()

	sp := support.Conn()
	spUp := support.Upstream()
	spTok := support.InternalToken()

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

	// ── Agentic AI specific endpoints → Node (gRPC) ───────────────────────────

	mux.Handle("POST /api/v1/ai/agentic/deep-search", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.AiDeepSearch, ndTok)))

	mux.Handle("POST /api/v1/ai/agentic/fast-search", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.AiFastSearch, ndTok)))

	mux.Handle("POST /api/v1/ai/agentic/translate", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.AiTranslate, ndTok)))

	mux.Handle("POST /api/v1/ai/agentic/summarize", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.AiSummarize, ndTok)))

	mux.Handle("POST /api/v1/ai/agentic/recommend", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.AiRecommend, ndTok)))

	mux.Handle("POST /api/v1/ai/agentic/product-ask", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.AiProductAsk, ndTok)))

	mux.Handle("POST /api/v1/ai/agentic/clean", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.AiCleanText, ndTok)))

	mux.Handle("POST /api/v1/ai/agentic/seller-analyze", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.SellerAnalyze, ndTok)))

	// AI quota endpoints
	mux.Handle("GET /api/v1/ai/agentic/deep-search/quota", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.AiDeepSearchQuota, ndTok)))

	mux.Handle("GET /api/v1/ai/agentic/global-search/quota", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.AiGlobalSearchQuota, ndTok)))

	// ── Chat threads → Node (gRPC) ────────────────────────────────────────────

	mux.Handle("POST /api/v1/ai/threads", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.ChatCreate, ndTok)))

	mux.Handle("GET /api/v1/ai/threads", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.ChatList, ndTok)))

	mux.Handle("GET /api/v1/ai/threads/{id}", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.ChatGet, ndTok, "id")))

	mux.Handle("DELETE /api/v1/ai/threads/{id}", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.ChatDelete, ndTok, "id")))

	mux.Handle("POST /api/v1/ai/threads/{id}/messages", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.ChatSendMessage, ndTok, "id")))

	// AI feature history
	mux.Handle("GET /api/v1/ai/history/{feature}", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.HistoryGet, ndTok, "feature")))

	// Recommendations
	mux.Handle("GET /api/v1/ai/recommend/me", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.AiGetRecommendations, ndTok)))

	// ── Seller analytics → Node (gRPC) ───────────────────────────────────────

	mux.Handle("POST /api/v1/ai/summaries/map", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.SellerMapSummaries, ndTok)))

	mux.Handle("POST /api/v1/ai/summaries/reduce", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.SellerReduceSummaries, ndTok)))

	mux.Handle("POST /api/v1/seller/listing/analyze", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.SellerAnalyzeListing, ndTok)))

	mux.Handle("POST /api/v1/seller/report/generate", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.SellerGenerateReport, ndTok)))

	mux.Handle("GET /api/v1/seller-report/{sellerId}", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.SellerGetReport, ndTok, "sellerId")))

	mux.Handle("POST /api/v1/agent/orchestrate", aiAuthenticated(
		grpcclient.Handler(nd, ndUp, grpcclient.AgentOrchestrate, ndTok)))

	// ── Support routes → Go Support (gRPC) ───────────────────────────────────

	mux.Handle("GET /api/v1/support/seller-summary", authenticated(
		grpcclient.Handler(sp, spUp, grpcclient.SupportGetSellerSummary, spTok)))

	// ── Internal routes → Go Support (gRPC) ──────────────────────────────────

	mux.Handle("GET /internal/validate-ssql", internalStack(
		grpcclient.Handler(sp, spUp, grpcclient.SupportValidateSSQL, spTok)))

	// ── Catch-all 404 ─────────────────────────────────────────────────────────

	mux.Handle("/", base(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())
		responses.Error(w, http.StatusNotFound, "NOT_FOUND",
			"no route matched "+r.URL.Path, traceID)
	})))

	return mux
}
