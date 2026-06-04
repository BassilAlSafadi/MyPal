// Package middleware provides the ordered gateway middleware stack.
// Each middleware follows the standard net/http handler chain pattern.
// The execution order defined in routing must match the architecture spec:
//
//  1. CorrelationID
//  2. StructuredLogging
//  3. PanicRecovery
//  4. InternalServiceAuth (internal routes only)
//  5. JWTValidation (protected routes only)
//  6. SSQLValidation (search routes only)
//  7. RateLimiting
//  8. Timeout
//  9. Observability
//  10. ProxyForwarding
package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mypal/api/go/internal/gateway/auth"
	"mypal/api/go/internal/gateway/responses"
	"mypal/api/go/internal/gateway/tracing"
	"mypal/api/go/internal/security"
	"net/http"
	"strings"
	"sync"
	"time"
)

// CORS applies browser access policy for the public Gateway.
// Entries in allowedOrigins may contain a single '*' wildcard (e.g.
// "https://*.vercel.app") which matches any string in that position.
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	exact := make(map[string]struct{})
	var wildcards []string

	for _, o := range allowedOrigins {
		o = strings.TrimSpace(o)
		if strings.Contains(o, "*") {
			wildcards = append(wildcards, o)
		} else {
			exact[o] = struct{}{}
		}
	}

	originAllowed := func(origin string) bool {
		if _, ok := exact[origin]; ok {
			return true
		}
		for _, pattern := range wildcards {
			idx := strings.Index(pattern, "*")
			prefix, suffix := pattern[:idx], pattern[idx+1:]
			if strings.HasPrefix(origin, prefix) && strings.HasSuffix(origin, suffix) {
				return true
			}
		}
		return false
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if originAllowed(origin) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Trace-ID, Idempotency-Key")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Add("Vary", "Origin")
			}

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// ----------------------------------------
// 1. Correlation ID / Request ID
// ----------------------------------------

// CorrelationID attaches a trace ID to every request context and response header.
func CorrelationID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.FromRequest(r)
		ctx := tracing.WithTraceID(r.Context(), traceID)
		tracing.SetResponseHeaders(w, traceID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ----------------------------------------
// 2. Structured Logging
// ----------------------------------------

// responseWriter wraps http.ResponseWriter to capture the status code.
type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

// StructuredLogging logs every request with method, path, status, latency, and trace ID.
func StructuredLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		traceID := tracing.TraceIDFrom(r.Context())
		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rw.status,
			"latency_ms", time.Since(start).Milliseconds(),
			"trace_id", traceID,
			"remote_addr", r.RemoteAddr,
		)
	})
}

// ----------------------------------------
// 3. Panic Recovery
// ----------------------------------------

// PanicRecovery catches any unhandled panic in downstream handlers,
// logs the event, and returns a 500 without leaking stack traces externally.
func PanicRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				traceID := tracing.TraceIDFrom(r.Context())
				slog.Error("panic recovered", "panic", rec, "trace_id", traceID)
				responses.InternalError(w, traceID)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// ----------------------------------------
// 4. Internal Service Authentication
// ----------------------------------------

// InternalAuth verifies that the request carries a valid INTERNAL_SERVICE_TOKEN.
// Apply only to /internal/* routes.
func InternalAuth(token string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			traceID := tracing.TraceIDFrom(r.Context())
			provided := r.Header.Get(tracing.HeaderInternalToken)
			if provided == "" || provided != token {
				slog.Warn("internal auth rejected", "trace_id", traceID, "path", r.URL.Path)
				responses.Forbidden(w, traceID)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ----------------------------------------
// 5. JWT Validation (Phase 2 — Full Implementation)
// ----------------------------------------

// JWTValidation validates Bearer JWTs using the shared HS256 secret issued by
// the C# Main API. On success, the verified identity is stored in the request
// context and forwarded to upstream services via trusted internal headers.
func JWTValidation(secret string) func(http.Handler) http.Handler {
	validator := auth.NewValidator(secret, "", "")

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			traceID := tracing.TraceIDFrom(r.Context())
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				auth.LogAuthEvent("missing_token", "", traceID, false)
				responses.Unauthorized(w, traceID)
				return
			}

			rawToken := strings.TrimPrefix(authHeader, "Bearer ")
			identity, err := validator.Validate(rawToken)
			if err != nil {
				if errors.Is(err, auth.ErrTokenExpired) {
					auth.LogAuthEvent("token_expired", "", traceID, false)
					responses.Error(w, http.StatusUnauthorized,
						responses.CodeUnauthorized, "token has expired", traceID)
					return
				}
				auth.LogAuthEvent("token_invalid", "", traceID, false)
				responses.Unauthorized(w, traceID)
				return
			}

			// Store identity in context for downstream handlers.
			ctx := auth.WithIdentity(r.Context(), identity)

			// Inject trusted internal identity headers for upstream services.
			// These are set AFTER validation — upstreams must trust only these,
			// never the raw Authorization header for identity decisions.
			r.Header.Set(auth.HeaderUserID, identity.UserID)
			r.Header.Set(auth.HeaderUserRoles, strings.Join(identity.Roles, ","))
			r.Header.Set(auth.HeaderUserEmail, identity.Email)

			auth.LogAuthEvent("token_validated", identity.UserID, traceID, true)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// ----------------------------------------
// 6. SSQL Validation Middleware (Phase 2 — Body Inspection)
// ----------------------------------------

// searchBody is used only to peek the q field from a POST search request.
type searchBody struct {
	Q string `json:"q"`
}

// SSQLValidation validates all search query inputs against injection patterns.
// Inspects both GET q= params and POST JSON body { "q": "..." }.
// On rejection: returns 400 with structured error and logs the event.
func SSQLValidation(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())

		// Check GET query parameter.
		if q := r.URL.Query().Get("q"); q != "" {
			if !security.IsQuerySafe(q) {
				slog.Warn("ssql: rejected unsafe GET param",
					"trace_id", traceID, "path", r.URL.Path)
				responses.InvalidQuery(w, traceID)
				return
			}
		}

		// Check POST body { "q": "..." } for search routes.
		if r.Method == http.MethodPost && r.Body != nil {
			bodyBytes, err := io.ReadAll(io.LimitReader(r.Body, 8*1024))
			if err == nil && len(bodyBytes) > 0 {
				var sb searchBody
				if json.Unmarshal(bodyBytes, &sb) == nil && sb.Q != "" {
					if !security.IsQuerySafe(sb.Q) {
						slog.Warn("ssql: rejected unsafe POST body query",
							"trace_id", traceID, "path", r.URL.Path)
						responses.InvalidQuery(w, traceID)
						return
					}
				}
				// Restore the body so the downstream handler can re-read it.
				r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
			}
		}

		next.ServeHTTP(w, r)
	})
}

// ----------------------------------------
// 7. Rate Limiting
// ----------------------------------------

// tokenBucket is a simple in-memory per-IP token bucket.
type tokenBucket struct {
	mu       sync.Mutex
	tokens   float64
	maxBurst float64
	rate     float64 // tokens per second
	lastTime time.Time
}

var (
	buckets     = sync.Map{}
	globalRPS   = 100.0
	globalBurst = 200.0
)

// ConfigureRateLimit sets the global RPS and burst for the rate limiter.
func ConfigureRateLimit(rps, burst int) {
	globalRPS = float64(rps)
	globalBurst = float64(burst)
}

func getBucket(ip string) *tokenBucket {
	v, _ := buckets.LoadOrStore(ip, &tokenBucket{
		tokens:   globalBurst,
		maxBurst: globalBurst,
		rate:     globalRPS,
		lastTime: time.Now(),
	})
	return v.(*tokenBucket)
}

// RateLimiting enforces per-IP request rate limits using a token bucket.
func RateLimiting(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())
		ip := r.RemoteAddr
		bucket := getBucket(ip)

		bucket.mu.Lock()
		now := time.Now()
		elapsed := now.Sub(bucket.lastTime).Seconds()
		bucket.tokens = min(bucket.maxBurst, bucket.tokens+elapsed*bucket.rate)
		bucket.lastTime = now
		if bucket.tokens < 1 {
			bucket.mu.Unlock()
			responses.RateLimited(w, traceID)
			return
		}
		bucket.tokens--
		bucket.mu.Unlock()

		next.ServeHTTP(w, r)
	})
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// ----------------------------------------
// 8. Timeout Middleware
// ----------------------------------------

// Timeout cancels the request context after the given duration,
// returning a 504 if the upstream does not respond in time.
func Timeout(d time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), d)
			defer cancel()
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// ----------------------------------------
// 9. Observability / Metrics Scaffold
// ----------------------------------------

// Observability records request timing for future Prometheus/OTEL integration.
// Currently writes structured logs. Replace the log calls with metric increments
// when the Prometheus client is wired in Phase 4.
func Observability(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		latency := time.Since(start)

		// TODO Phase 4: increment prometheus counters and histograms here.
		// e.g. requestDuration.WithLabelValues(r.Method, r.URL.Path, strconv.Itoa(rw.status)).Observe(latency.Seconds())

		if latency > 1500*time.Millisecond {
			slog.Warn("slow request",
				"path", r.URL.Path,
				"latency_ms", latency.Milliseconds(),
				"trace_id", tracing.TraceIDFrom(r.Context()),
			)
		}
	})
}

// ----------------------------------------
// 10. Request Size Limit
// ----------------------------------------

// RequestSizeLimit rejects requests with bodies exceeding maxBytes.
func RequestSizeLimit(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.ContentLength > maxBytes {
				traceID := tracing.TraceIDFrom(r.Context())
				responses.Error(w, http.StatusRequestEntityTooLarge,
					responses.CodeRequestTooLarge, "request body too large", traceID)
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			next.ServeHTTP(w, r)
		})
	}
}

// ----------------------------------------
// Chain Helper
// ----------------------------------------

// Chain composes multiple middleware into a single handler, applied in order.
// Chain(A, B, C)(handler) → A(B(C(handler)))
func Chain(middlewares ...func(http.Handler) http.Handler) func(http.Handler) http.Handler {
	return func(final http.Handler) http.Handler {
		for i := len(middlewares) - 1; i >= 0; i-- {
			final = middlewares[i](final)
		}
		return final
	}
}
