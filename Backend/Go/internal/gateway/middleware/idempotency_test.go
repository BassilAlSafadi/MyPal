package middleware_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"mypal/api/go/internal/gateway/middleware"
	"mypal/api/go/internal/gateway/testutil"
)

func newIntegrationPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	dsn := testutil.RequirePostgres(t)

	ctx := context.Background()
	adminPool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("open admin pool: %v", err)
	}
	t.Cleanup(adminPool.Close)

	schema := "idemp_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err := adminPool.Exec(ctx, `CREATE SCHEMA `+schema); err != nil {
		t.Fatalf("create test schema: %v", err)
	}
	t.Cleanup(func() {
		_, _ = adminPool.Exec(context.Background(), `DROP SCHEMA IF EXISTS `+schema+` CASCADE`)
	})

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatalf("parse test dsn: %v", err)
	}
	if cfg.ConnConfig.RuntimeParams == nil {
		cfg.ConnConfig.RuntimeParams = map[string]string{}
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("open schema pool: %v", err)
	}
	t.Cleanup(pool.Close)

	if _, err := pool.Exec(ctx, `
		CREATE TABLE api_idempotency (
			idempotency_key text PRIMARY KEY,
			fingerprint text NOT NULL,
			correlation_id text NOT NULL,
			status text NOT NULL,
			status_code integer,
			response_payload bytea,
			created_at timestamp with time zone NOT NULL,
			updated_at timestamp with time zone NOT NULL,
			expires_at timestamp with time zone NOT NULL
		);
	`); err != nil {
		t.Fatalf("create tables: %v", err)
	}

	return pool
}

func TestIdempotencyMiddleware(t *testing.T) {
	pool := newIntegrationPool(t)
	mw := middleware.Idempotency(pool)

	businessLogicHitCount := 0
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		businessLogicHitCount++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"success":true}`))
	}))

	t.Run("first request completes successfully", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/checkout", bytes.NewBufferString(`{"item":"book"}`))
		req.Header.Set("Idempotency-Key", "key-123")
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d", rec.Code)
		}
		if businessLogicHitCount != 1 {
			t.Fatalf("expected 1 handler hit, got %d", businessLogicHitCount)
		}
		if rec.Body.String() != `{"success":true}` {
			t.Fatalf("unexpected body: %s", rec.Body.String())
		}
	})

	t.Run("duplicate request replays response", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/checkout", bytes.NewBufferString(`{"item":"book"}`))
		req.Header.Set("Idempotency-Key", "key-123")
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d", rec.Code)
		}
		// Business logic should NOT be hit again
		if businessLogicHitCount != 1 {
			t.Fatalf("expected handler hit to remain 1, got %d", businessLogicHitCount)
		}
		if rec.Body.String() != `{"success":true}` {
			t.Fatalf("unexpected body: %s", rec.Body.String())
		}
		if rec.Header().Get("Idempotent-Replay") != "true" {
			t.Fatalf("expected Idempotent-Replay header")
		}
	})

	t.Run("concurrent requests serialize safely", func(t *testing.T) {
		// Mock a handler that sleeps to simulate work
		slowHandler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			time.Sleep(200 * time.Millisecond)
			w.WriteHeader(http.StatusOK)
		}))

		req1 := httptest.NewRequest("POST", "/checkout", nil)
		req1.Header.Set("Idempotency-Key", "key-concurrent")
		rec1 := httptest.NewRecorder()

		req2 := httptest.NewRequest("POST", "/checkout", nil)
		req2.Header.Set("Idempotency-Key", "key-concurrent")
		rec2 := httptest.NewRecorder()

		// Start req1
		go func() {
			slowHandler.ServeHTTP(rec1, req1)
		}()

		// Small delay to ensure req1 inserts into DB
		time.Sleep(50 * time.Millisecond)

		// Start req2
		slowHandler.ServeHTTP(rec2, req2)

		// req2 should be rejected as concurrent
		if rec2.Code != http.StatusConflict {
			t.Fatalf("expected req2 to get 409 Conflict, got %d", rec2.Code)
		}
	})
}

func TestIdempotencyFingerprintMismatchRejected(t *testing.T) {
	pool := newIntegrationPool(t)
	mw := middleware.Idempotency(pool)

	hits := 0
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"ok":true}`))
	}))

	req1 := httptest.NewRequest("POST", "/checkout", bytes.NewBufferString(`{"a":1}`))
	req1.Header.Set("Idempotency-Key", "fp-mismatch-key")
	rec1 := httptest.NewRecorder()
	handler.ServeHTTP(rec1, req1)
	if rec1.Code != http.StatusCreated {
		t.Fatalf("first: %d", rec1.Code)
	}

	req2 := httptest.NewRequest("POST", "/checkout", bytes.NewBufferString(`{"a":2}`))
	req2.Header.Set("Idempotency-Key", "fp-mismatch-key")
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusConflict {
		t.Fatalf("expected 409 on fingerprint mismatch, got %d body=%s", rec2.Code, rec2.Body.String())
	}
	if hits != 1 {
		t.Fatalf("handler should run once, got %d", hits)
	}
}
