// Package proxy implements the centralized reverse proxy for the Go Gateway.
// It handles upstream forwarding with timeout control, trace header propagation,
// internal auth header injection, and standardized upstream error handling.
package proxy

import (
	"context"
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
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())
		ctx, cancel := context.WithTimeout(r.Context(), d.Timeout)
		defer cancel()

		// Build upstream URL.
		targetPath := strings.TrimPrefix(r.URL.Path, prefixToStrip)
		if targetPath == "" {
			targetPath = "/"
		}
		targetURL, err := url.Parse(fmt.Sprintf("%s%s", d.BaseURL, targetPath))
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

		// Inject tracing and internal auth.
		tracing.InjectHeaders(req, traceID, d.InternalToken)

		// Forward.
		client := &http.Client{Timeout: d.Timeout}
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

		// Relay response headers (filtered).
		relayHeaders(w, resp)
		tracing.SetResponseHeaders(w, traceID)

		w.WriteHeader(resp.StatusCode)
		if _, err := io.Copy(w, resp.Body); err != nil {
			slog.Warn("proxy: failed to relay body",
				"err", err, "trace_id", traceID)
		}

		slog.Info("proxy: upstream response",
			"upstream", d.BaseURL,
			"path", targetPath,
			"status", resp.StatusCode,
			"trace_id", traceID,
		)
	})
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
	}
	for key, vals := range src.Header {
		if allow[strings.ToLower(key)] {
			for _, v := range vals {
				dst.Header.Add(key, v)
			}
		}
	}
}

// relayHeaders copies response headers from upstream to the client response.
// Internal infrastructure headers (X-Internal-Token) are stripped.
func relayHeaders(dst http.ResponseWriter, src *http.Response) {
	strip := map[string]bool{
		strings.ToLower(tracing.HeaderInternalToken): true,
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
