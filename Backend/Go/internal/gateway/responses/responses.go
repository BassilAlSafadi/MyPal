// Package responses provides standardized JSON response helpers for the Gateway.
// All error and success shapes are defined here so every handler produces
// consistent, observable output.
package responses

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// Envelope is the top-level shape for every gateway response.
type Envelope struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   *APIError   `json:"error,omitempty"`
}

// APIError carries structured error detail.
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	TraceID string `json:"trace_id,omitempty"`
}

// Standard gateway error codes.
const (
	CodeUpstreamTimeout   = "UPSTREAM_TIMEOUT"
	CodeUpstreamError     = "UPSTREAM_ERROR"
	CodeUnauthorized      = "UNAUTHORIZED"
	CodeForbidden         = "FORBIDDEN"
	CodeInvalidQuery      = "INVALID_QUERY"
	CodeRateLimited       = "RATE_LIMITED"
	CodeRequestTooLarge   = "REQUEST_TOO_LARGE"
	CodeInternalError     = "INTERNAL_ERROR"
	CodeServiceUnavailable = "SERVICE_UNAVAILABLE"
)

// JSON writes a standardised JSON envelope response.
func JSON(w http.ResponseWriter, status int, env Envelope) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(env); err != nil {
		slog.Error("failed to encode response", "err", err)
	}
}

// OK writes a 200 JSON success envelope.
func OK(w http.ResponseWriter, data interface{}) {
	JSON(w, http.StatusOK, Envelope{Success: true, Data: data})
}

// Error writes a JSON error envelope with trace correlation.
func Error(w http.ResponseWriter, status int, code, message, traceID string) {
	JSON(w, status, Envelope{
		Success: false,
		Error: &APIError{
			Code:    code,
			Message: message,
			TraceID: traceID,
		},
	})
}

// UpstreamTimeout writes a 504 upstream-timeout error.
func UpstreamTimeout(w http.ResponseWriter, service, traceID string) {
	Error(w, http.StatusGatewayTimeout, CodeUpstreamTimeout,
		service+" did not respond in time", traceID)
}

// UpstreamUnavailable writes a 503.
func UpstreamUnavailable(w http.ResponseWriter, service, traceID string) {
	Error(w, http.StatusServiceUnavailable, CodeServiceUnavailable,
		service+" is currently unavailable", traceID)
}

// Unauthorized writes a 401.
func Unauthorized(w http.ResponseWriter, traceID string) {
	Error(w, http.StatusUnauthorized, CodeUnauthorized,
		"authentication required", traceID)
}

// Forbidden writes a 403.
func Forbidden(w http.ResponseWriter, traceID string) {
	Error(w, http.StatusForbidden, CodeForbidden,
		"insufficient permissions", traceID)
}

// InvalidQuery writes a 400 SSQL rejection.
func InvalidQuery(w http.ResponseWriter, traceID string) {
	Error(w, http.StatusBadRequest, CodeInvalidQuery,
		"query contains disallowed patterns", traceID)
}

// RateLimited writes a 429.
func RateLimited(w http.ResponseWriter, traceID string) {
	Error(w, http.StatusTooManyRequests, CodeRateLimited,
		"too many requests", traceID)
}

// InternalError writes a 500 without leaking stack details.
func InternalError(w http.ResponseWriter, traceID string) {
	Error(w, http.StatusInternalServerError, CodeInternalError,
		"an internal error occurred", traceID)
}
