package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAgenticOrchestratorJoinsTrailingSlashBaseURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/ai/fast-search" {
			t.Fatalf("expected /ai/fast-search, got %q", r.URL.Path)
		}
		if strings.Contains(r.RequestURI, "//ai/") {
			t.Fatalf("request URI contains double slash: %q", r.RequestURI)
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]any{
			"result":   "ok",
			"trace_id": "trace-1",
		}); err != nil {
			t.Fatalf("write response: %v", err)
		}
	}))
	defer server.Close()

	svc := NewAgenticOrchestrator(server.URL + "/")
	result, err := svc.FastSearch(context.Background(), "test")
	if err != nil {
		t.Fatalf("FastSearch returned error: %v", err)
	}
	if result.Result != "ok" {
		t.Fatalf("expected result ok, got %#v", result.Result)
	}
}

func TestAgenticOrchestratorAcceptsStructuredResult(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"title":    "Example",
				"currency": "USD",
			},
			"trace_id": "trace-2",
		}); err != nil {
			t.Fatalf("write response: %v", err)
		}
	}))
	defer server.Close()

	svc := NewAgenticOrchestrator(server.URL)
	result, err := svc.Clean(context.Background(), "raw product text")
	if err != nil {
		t.Fatalf("Clean returned error: %v", err)
	}

	structured, ok := result.Result.(map[string]any)
	if !ok {
		t.Fatalf("expected structured result, got %#v", result.Result)
	}
	if structured["title"] != "Example" {
		t.Fatalf("expected title Example, got %#v", structured["title"])
	}
}

func TestAgenticOrchestratorReportsNonJSONUpstreamResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusNotFound)
		if _, err := w.Write([]byte("<!DOCTYPE html><html><body><pre>Cannot POST //ai/fast-search</pre></body></html>")); err != nil {
			t.Fatalf("write response: %v", err)
		}
	}))
	defer server.Close()

	svc := NewAgenticOrchestrator(server.URL)
	_, err := svc.FastSearch(context.Background(), "test")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "non-JSON response 404") {
		t.Fatalf("expected non-JSON status in error, got %q", err.Error())
	}
	if !strings.Contains(err.Error(), "Cannot POST //ai/fast-search") {
		t.Fatalf("expected upstream body in error, got %q", err.Error())
	}
}
