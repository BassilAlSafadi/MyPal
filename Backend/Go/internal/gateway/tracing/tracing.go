// Package tracing provides distributed tracing primitives for the Gateway.
// It manages correlation IDs and propagates trace context across upstream calls.
// OpenTelemetry exporter hooks are scaffolded but not wired yet.
package tracing

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
)

// ContextKey is the type for context keys in this package.
type ContextKey string

const (
	// TraceIDKey is the context key for the correlation / trace ID.
	TraceIDKey ContextKey = "trace_id"

	// Header names propagated across service calls.
	HeaderTraceID       = "X-Trace-ID"
	HeaderCorrelationID = "X-Correlation-ID" // alias accepted from clients
	HeaderInternalToken = "X-Internal-Token"
)

// NewTraceID generates a cryptographically random 16-byte hex trace ID.
func NewTraceID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// Fallback: counter-based ID (never happens in practice).
		return "fallback-trace-id"
	}
	return hex.EncodeToString(b)
}

// FromRequest extracts an existing trace ID from incoming request headers,
// or generates a new one if absent.
func FromRequest(r *http.Request) string {
	if id := r.Header.Get(HeaderTraceID); id != "" {
		return id
	}
	if id := r.Header.Get(HeaderCorrelationID); id != "" {
		return id
	}
	return NewTraceID()
}

// WithTraceID returns a new context carrying the trace ID.
func WithTraceID(ctx context.Context, traceID string) context.Context {
	return context.WithValue(ctx, TraceIDKey, traceID)
}

// TraceIDFrom extracts the trace ID from a context.
// Returns empty string if not present.
func TraceIDFrom(ctx context.Context) string {
	if id, ok := ctx.Value(TraceIDKey).(string); ok {
		return id
	}
	return ""
}

// InjectHeaders sets all required propagation headers on an outgoing request.
// Call this before every upstream HTTP call made by the gateway.
func InjectHeaders(r *http.Request, traceID, internalToken string) {
	r.Header.Set(HeaderTraceID, traceID)
	r.Header.Set(HeaderCorrelationID, traceID)
	if internalToken != "" {
		r.Header.Set(HeaderInternalToken, internalToken)
	}
}

// SetResponseHeaders writes trace context into the outgoing response so that
// clients and monitoring systems can correlate frontend requests to backend spans.
func SetResponseHeaders(w http.ResponseWriter, traceID string) {
	w.Header().Set(HeaderTraceID, traceID)
}

// --- OpenTelemetry Scaffold ---
// The functions below are stubs ready for a future OTEL exporter integration.
// Replace the bodies with real otel span creation when the observability stack
// (Jaeger / Tempo) is deployed.

// StartSpan is a no-op placeholder for OTEL span creation.
// Signature mirrors otel.Tracer.Start so callers can be updated in-place.
func StartSpan(ctx context.Context, name string) (context.Context, func()) {
	// TODO: replace with real OTEL span when exporter is configured.
	return ctx, func() {}
}
