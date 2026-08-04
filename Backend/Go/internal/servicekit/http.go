// Package servicekit holds the cross-cutting HTTP concerns the Go microservices
// share: CORS, JWT validation, structured logging, panic recovery and trace IDs.
//
// These used to live in the gateway (internal/gateway/middleware). With the
// gateway retired, the SPA calls each service directly, so each service applies
// them itself. The behaviour is the gateway's, unchanged.
package servicekit

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type contextKey string

const (
	identityKey contextKey = "identity"
	traceIDKey  contextKey = "trace_id"

	// HeaderUserID and friends are the identity headers the gateway used to
	// inject. They are still set on the request so handlers read identity the
	// same way they always did.
	HeaderUserID    = "X-User-Id"
	HeaderUserEmail = "X-User-Email"
	HeaderUserRoles = "X-User-Roles"
	HeaderTraceID   = "X-Trace-ID"
)

// Identity holds the verified claims extracted from a validated JWT.
type Identity struct {
	UserID   string
	Email    string
	Roles    []string
	IsBuyer  bool
	IsSeller bool
}

// claims defines the canonical JWT claims issued by the auth service.
// The `roles` claim carries comma-separated role names: "buyer", "seller", "admin".
type claims struct {
	Email    string `json:"email"`
	Roles    string `json:"roles"`
	IsBuyer  bool   `json:"is_buyer"`
	IsSeller bool   `json:"is_seller"`
	jwt.RegisteredClaims
}

// IdentityFrom extracts an Identity from a context. Nil when unauthenticated.
func IdentityFrom(ctx context.Context) *Identity {
	id, _ := ctx.Value(identityKey).(*Identity)
	return id
}

// TraceIDFrom returns the request's trace ID.
func TraceIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(traceIDKey).(string)
	return id
}

// Middleware is the standard net/http decorator shape.
type Middleware func(http.Handler) http.Handler

// Chain applies middleware left to right, so the first argument is outermost.
func Chain(middlewares ...Middleware) Middleware {
	return func(final http.Handler) http.Handler {
		for i := len(middlewares) - 1; i >= 0; i-- {
			final = middlewares[i](final)
		}
		return final
	}
}

// CORS applies browser access policy. Entries in allowedOrigins may contain a
// single '*' wildcard (e.g. "https://*.vercel.app") which matches any string in
// that position.
func CORS(allowedOrigins []string) Middleware {
	exact := make(map[string]struct{})
	var wildcards []string

	for _, o := range allowedOrigins {
		o = strings.TrimSpace(o)
		if o == "" {
			continue
		}
		if strings.Contains(o, "*") {
			wildcards = append(wildcards, o)
		} else {
			exact[o] = struct{}{}
		}
	}

	originAllowed := func(origin string) bool {
		if origin == "" {
			return false
		}
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

// CorrelationID attaches a trace ID to every request context and response header.
func CorrelationID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := r.Header.Get(HeaderTraceID)
		if traceID == "" {
			traceID = uuid.NewString()
		}
		w.Header().Set(HeaderTraceID, traceID)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), traceIDKey, traceID)))
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

// StructuredLogging logs every request with method, path, status, latency and trace ID.
func StructuredLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", sw.status,
			"latency_ms", time.Since(start).Milliseconds(),
			"trace_id", TraceIDFrom(r.Context()),
		)
	})
}

// PanicRecovery catches any unhandled panic in downstream handlers, logs the
// event, and returns a 500 without leaking stack traces externally.
func PanicRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				traceID := TraceIDFrom(r.Context())
				slog.Error("panic recovered", "panic", rec, "trace_id", traceID)
				WriteJSON(w, http.StatusInternalServerError, map[string]any{
					"error": "internal_server_error", "trace_id": traceID,
				})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// JWTValidation validates Bearer JWTs using the shared HS256 secret issued by
// the auth service. On success the verified identity is stored in the request
// context and mirrored onto the trusted internal headers.
//
// Inbound identity headers are stripped first, so a client cannot forge one.
func JWTValidation(secret string) Middleware {
	key := []byte(secret)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Header.Del(HeaderUserID)
			r.Header.Del(HeaderUserEmail)
			r.Header.Del(HeaderUserRoles)

			traceID := TraceIDFrom(r.Context())

			authHeader := r.Header.Get("Authorization")
			if !strings.HasPrefix(authHeader, "Bearer ") {
				WriteJSON(w, http.StatusUnauthorized, map[string]any{
					"error": "missing or malformed Authorization header", "trace_id": traceID,
				})
				return
			}

			identity, err := validateToken(strings.TrimPrefix(authHeader, "Bearer "), key)
			if err != nil {
				message := "token is invalid"
				if errors.Is(err, jwt.ErrTokenExpired) {
					message = "token has expired"
				}
				WriteJSON(w, http.StatusUnauthorized, map[string]any{"error": message, "trace_id": traceID})
				return
			}

			r.Header.Set(HeaderUserID, identity.UserID)
			r.Header.Set(HeaderUserEmail, identity.Email)
			r.Header.Set(HeaderUserRoles, strings.Join(identity.Roles, ","))

			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), identityKey, identity)))
		})
	}
}

func validateToken(raw string, key []byte) (*Identity, error) {
	token, err := jwt.ParseWithClaims(raw, &claims{}, func(t *jwt.Token) (any, error) {
		// Enforce HS256 — reject any algorithm switching attack.
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return key, nil
	}, jwt.WithExpirationRequired(), jwt.WithIssuedAt())
	if err != nil {
		return nil, err
	}

	c, ok := token.Claims.(*claims)
	if !ok || !token.Valid || c.Subject == "" {
		return nil, errors.New("required claims are missing")
	}

	return &Identity{
		UserID:   c.Subject,
		Email:    c.Email,
		Roles:    parseRoles(c.Roles),
		IsBuyer:  c.IsBuyer,
		IsSeller: c.IsSeller,
	}, nil
}

func parseRoles(raw string) []string {
	if raw == "" {
		return []string{"buyer"} // safe default
	}
	var out []string
	for _, p := range strings.Split(raw, ",") {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	if len(out) == 0 {
		return []string{"buyer"}
	}
	return out
}

// WriteJSON writes v as a JSON response with the given status.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// DecodeJSON reads a JSON request body into v.
func DecodeJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	return json.NewDecoder(io.LimitReader(r.Body, maxBodyBytes)).Decode(v)
}

const maxBodyBytes = 4 << 20 // 4 MiB

// Env reads an environment variable with a fallback.
func Env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// AllowedOrigins parses CORS_ALLOWED_ORIGINS.
func AllowedOrigins() []string {
	return strings.Split(Env("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"), ",")
}
