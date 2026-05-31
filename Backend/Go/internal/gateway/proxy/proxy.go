// Package proxy implements the centralized reverse proxy for the Go Gateway.
// It handles upstream forwarding with timeout control, trace header propagation,
// internal auth header injection, and standardized upstream error handling.
package proxy

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mypal/api/go/internal/gateway/responses"
	"mypal/api/go/internal/gateway/tracing"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Director configures a single upstream target.
type Director struct {
	BaseURL       string
	Timeout       time.Duration
	InternalToken string
}

// Handler builds an http.Handler that proxies the incoming request to the upstream.
// It:
//   - strips the route prefix (prefixToStrip) from the path
//   - injects trace and internal auth headers
//   - enforces the timeout defined in Director
//   - normalises upstream errors into standard gateway envelopes
func (d *Director) Handler(prefixToStrip string) http.Handler {
	return d.HandlerWithRewrite(prefixToStrip, "")
}

// HandlerWithRewrite strips a public gateway prefix and prepends an upstream
// prefix before forwarding the request. JSON responses are normalized into the
// Gateway envelope unless the upstream already returned one.
func (d *Director) HandlerWithRewrite(prefixToStrip string, upstreamPrefix string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())
		ctx, cancel := context.WithTimeout(r.Context(), d.Timeout)
		defer cancel()

		// Build upstream URL.
		targetPath := rewritePath(r.URL.Path, prefixToStrip, upstreamPrefix)
		targetURL, err := url.Parse(fmt.Sprintf("%s%s", strings.TrimRight(d.BaseURL, "/"), targetPath))
		if err != nil {
			slog.Error("proxy: failed to parse upstream URL",
				"err", err, "trace_id", traceID)
			responses.InternalError(w, traceID)
			return
		}
		targetURL.RawQuery = r.URL.RawQuery

		// Build the outgoing request.
		req, err := http.NewRequestWithContext(ctx, r.Method, targetURL.String(), r.Body)
		if err != nil {
			slog.Error("proxy: failed to create upstream request",
				"err", err, "trace_id", traceID)
			responses.InternalError(w, traceID)
			return
		}

		// Copy safe headers from the original request.
		copyHeaders(req, r)
		setForwardedHeaders(req, r)

		// Inject tracing and internal auth.
		tracing.InjectHeaders(req, traceID, d.InternalToken)

		// Forward.
		client := &http.Client{
			Timeout: d.Timeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
		resp, err := client.Do(req)
		if err != nil {
			if ctx.Err() == context.DeadlineExceeded {
				slog.Warn("proxy: upstream timeout",
					"upstream", d.BaseURL, "trace_id", traceID)
				responses.UpstreamTimeout(w, d.BaseURL, traceID)
				return
			}
			slog.Warn("proxy: upstream unavailable",
				"upstream", d.BaseURL, "err", err, "trace_id", traceID)
			responses.UpstreamUnavailable(w, d.BaseURL, traceID)
			return
		}
		defer resp.Body.Close()

		rawBody, err := io.ReadAll(resp.Body)
		if err != nil {
			slog.Warn("proxy: failed to read upstream body", "err", err, "trace_id", traceID)
			responses.InternalError(w, traceID)
			return
		}

		if isRedirect(resp.StatusCode) || !isJSONResponse(resp, rawBody) {
			relayHeaders(w, resp)
			tracing.SetResponseHeaders(w, traceID)
			w.WriteHeader(resp.StatusCode)
			if len(rawBody) > 0 {
				if _, err := w.Write(rawBody); err != nil {
					slog.Warn("proxy: failed to relay body",
						"err", err, "trace_id", traceID)
				}
			}
		} else {
			relayHeaders(w, resp)
			writeGatewayEnvelope(w, resp.StatusCode, rawBody, traceID)
		}

		slog.Info("proxy: upstream response",
			"upstream", d.BaseURL,
			"path", targetPath,
			"status", resp.StatusCode,
			"trace_id", traceID,
		)
	})
}

func rewritePath(path, prefixToStrip, upstreamPrefix string) string {
	targetPath := strings.TrimPrefix(path, prefixToStrip)
	if targetPath == "" {
		targetPath = "/"
	}
	if !strings.HasPrefix(targetPath, "/") {
		targetPath = "/" + targetPath
	}

	if upstreamPrefix == "" || upstreamPrefix == "/" {
		return targetPath
	}
	return strings.TrimRight(upstreamPrefix, "/") + targetPath
}

// copyHeaders copies a safe subset of headers to the upstream request.
func copyHeaders(dst, src *http.Request) {
	allow := map[string]bool{
		"content-type":    true,
		"accept":          true,
		"authorization":   true,
		"content-length":  true,
		"accept-encoding": true,
		"user-agent":      true,
		"cookie":          true,
		// Trusted identity headers set by JWTValidation after the token is verified.
		// Inbound client-supplied X-User-* are stripped upstream (stripIdentityHeaders),
		// so only gateway-validated values reach here. Upstreams (e.g. C# ResolveUserAsync)
		// read X-User-Id for identity — without forwarding these, every authed route 401s.
		"x-user-id":    true,
		"x-user-roles": true,
		"x-user-email": true,
	}
	for key, vals := range src.Header {
		if allow[strings.ToLower(key)] {
			for _, v := range vals {
				dst.Header.Add(key, v)
			}
		}
	}
}

func setForwardedHeaders(dst, src *http.Request) {
	dst.Header.Set("X-Forwarded-Host", src.Host)
	dst.Header.Set("X-Forwarded-Proto", forwardedProto(src))
	if src.RemoteAddr != "" {
		dst.Header.Set("X-Forwarded-For", src.RemoteAddr)
	}
}

func forwardedProto(r *http.Request) string {
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		return proto
	}
	if r.TLS != nil {
		return "https"
	}
	return "http"
}

// relayHeaders copies response headers from upstream to the client response.
// Internal infrastructure headers (X-Internal-Token) are stripped.
func relayHeaders(dst http.ResponseWriter, src *http.Response) {
	strip := map[string]bool{
		strings.ToLower(tracing.HeaderInternalToken): true,
		"content-length": true,
	}
	for key, vals := range src.Header {
		if strip[strings.ToLower(key)] {
			continue
		}
		for _, v := range vals {
			dst.Header().Add(key, v)
		}
	}
}

func isRedirect(status int) bool {
	return status >= 300 && status < 400
}

func isJSONResponse(resp *http.Response, body []byte) bool {
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "application/json")
	}
	if strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "application/json") {
		return true
	}
	return strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") || strings.HasPrefix(trimmed, `"`)
}

func writeGatewayEnvelope(w http.ResponseWriter, status int, rawBody []byte, traceID string) {
	parsed, parseErr := parseJSONBody(rawBody)
	if status >= http.StatusBadRequest {
		responses.Error(w, status, upstreamErrorCode(status), errorMessageFromBody(parsed, rawBody, status), traceID)
		return
	}

	if parseErr != nil {
		responses.JSON(w, status, responses.Envelope{Success: true, Data: string(rawBody)})
		return
	}

	if envelope, ok := parsed.(map[string]interface{}); ok {
		if _, hasSuccess := envelope["success"]; hasSuccess {
			responses.JSON(w, status, responses.Envelope{
				Success: envelope["success"] == true,
				Data:    envelope["data"],
				Error:   envelopeError(envelope["error"]),
			})
			return
		}
	}

	responses.JSON(w, status, responses.Envelope{Success: true, Data: parsed})
}

func parseJSONBody(rawBody []byte) (interface{}, error) {
	if len(strings.TrimSpace(string(rawBody))) == 0 {
		return nil, nil
	}
	var parsed interface{}
	err := json.Unmarshal(rawBody, &parsed)
	return parsed, err
}

func upstreamErrorCode(status int) string {
	switch status {
	case http.StatusUnauthorized:
		return responses.CodeUnauthorized
	case http.StatusForbidden:
		return responses.CodeForbidden
	case http.StatusRequestEntityTooLarge:
		return responses.CodeRequestTooLarge
	default:
		return responses.CodeUpstreamError
	}
}

func errorMessageFromBody(parsed interface{}, rawBody []byte, status int) string {
	switch value := parsed.(type) {
	case string:
		if strings.TrimSpace(value) != "" {
			return value
		}
	case map[string]interface{}:
		for _, key := range []string{"message", "error", "detail"} {
			if msg, ok := value[key].(string); ok && strings.TrimSpace(msg) != "" {
				return msg
			}
		}
	}

	if raw := strings.TrimSpace(string(rawBody)); raw != "" {
		return raw
	}
	return fmt.Sprintf("upstream returned status %d", status)
}

func envelopeError(raw interface{}) *responses.APIError {
	if raw == nil {
		return nil
	}
	if errMap, ok := raw.(map[string]interface{}); ok {
		apiErr := &responses.APIError{}
		if code, ok := errMap["code"].(string); ok {
			apiErr.Code = code
		}
		if message, ok := errMap["message"].(string); ok {
			apiErr.Message = message
		}
		if traceID, ok := errMap["trace_id"].(string); ok {
			apiErr.TraceID = traceID
		}
		return apiErr
	}
	return &responses.APIError{Code: responses.CodeUpstreamError, Message: fmt.Sprint(raw)}
}
