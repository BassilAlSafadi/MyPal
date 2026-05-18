// Package observability provides health aggregation and metrics scaffolding.
package observability

import (
	"context"
	"encoding/json"
	"log/slog"
	"mypal/api/go/internal/gateway/tracing"
	"net/http"
	"sync"
	"time"
)

// DependencyStatus captures a single upstream service health result.
type DependencyStatus struct {
	Service   string `json:"service"`
	URL       string `json:"url"`
	Healthy   bool   `json:"healthy"`
	LatencyMs int64  `json:"latency_ms"`
	Error     string `json:"error,omitempty"`
}

// HealthResponse is the aggregated health envelope.
type HealthResponse struct {
	Status       string             `json:"status"` // "healthy" | "degraded" | "unhealthy"
	Version      string             `json:"version"`
	Timestamp    string             `json:"timestamp"`
	Dependencies []DependencyStatus `json:"dependencies"`
}

// Dependency defines a downstream service to be health-checked.
type Dependency struct {
	Name        string
	HealthURL   string
	Timeout     time.Duration
}

// Handler returns an http.HandlerFunc that checks all dependencies in parallel
// and returns the aggregated health report.
func Handler(version string, deps []Dependency) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())
		results := checkAll(deps)

		overall := "healthy"
		allHealthy := true
		for _, d := range results {
			if !d.Healthy {
				allHealthy = false
				break
			}
		}
		if !allHealthy {
			overall = "degraded"
		}

		status := http.StatusOK
		if !allHealthy {
			status = http.StatusServiceUnavailable
		}

		resp := HealthResponse{
			Status:       overall,
			Version:      version,
			Timestamp:    time.Now().UTC().Format(time.RFC3339),
			Dependencies: results,
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set(tracing.HeaderTraceID, traceID)
		w.WriteHeader(status)
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			slog.Error("health: failed to encode response", "err", err)
		}
	}
}

// checkAll probes all dependencies in parallel and collects results.
func checkAll(deps []Dependency) []DependencyStatus {
	var wg sync.WaitGroup
	results := make([]DependencyStatus, len(deps))

	for i, dep := range deps {
		wg.Add(1)
		go func(idx int, d Dependency) {
			defer wg.Done()
			results[idx] = probe(d)
		}(i, dep)
	}
	wg.Wait()
	return results
}

// probe performs a GET to the dependency's health URL.
func probe(dep Dependency) DependencyStatus {
	start := time.Now()
	timeout := dep.Timeout
	if timeout == 0 {
		timeout = 3 * time.Second
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, dep.HealthURL, nil)
	if err != nil {
		return DependencyStatus{
			Service: dep.Name, URL: dep.HealthURL,
			Healthy: false, Error: err.Error(),
		}
	}

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return DependencyStatus{
			Service: dep.Name, URL: dep.HealthURL,
			Healthy: false, LatencyMs: latency, Error: err.Error(),
		}
	}
	defer resp.Body.Close()

	healthy := resp.StatusCode >= 200 && resp.StatusCode < 300
	errMsg := ""
	if !healthy {
		errMsg = http.StatusText(resp.StatusCode)
	}

	return DependencyStatus{
		Service:   dep.Name,
		URL:       dep.HealthURL,
		Healthy:   healthy,
		LatencyMs: latency,
		Error:     errMsg,
	}
}
