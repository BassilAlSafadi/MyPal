package uat_test

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"mypal/api/go/internal/gateway/middleware"
	"mypal/api/go/internal/gateway/saga"
	"mypal/api/go/internal/gateway/testutil"
)

// TestUAT_SchemaMatchesRuntimeQueries ensures gateway SQL columns exist (no drift).
func TestUAT_SchemaMatchesRuntimeQueries(t *testing.T) {
	pool := testutil.UATPool(t)
	ctx := context.Background()

	checks := []struct {
		table  string
		column string
	}{
		{"saga_states", "saga_id"},
		{"saga_states", "status"},
		{"saga_states", "correlation_id"},
		{"saga_states", "retry_count"},
		{"saga_steps", "timestamp"},
		{"api_idempotency", "fingerprint"},
		{"gateway_poison_events", "headers_json"},
		{"processed_events", "consumer"},
		{"outbox_events", "publish_status"},
	}
	for _, c := range checks {
		var exists bool
		err := pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_schema = current_schema()
				  AND table_name = $1 AND column_name = $2
			)`, c.table, c.column).Scan(&exists)
		if err != nil {
			t.Fatalf("%s.%s query: %v", c.table, c.column, err)
		}
		if !exists {
			t.Fatalf("schema drift: missing %s.%s", c.table, c.column)
		}
	}

	// Runtime smoke: saga store insert/select path
	store := saga.NewStore(pool)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	sagaID := uuid.New().String()
	now := time.Now().UTC()
	if err := store.InitializeSaga(ctx, tx, &saga.SagaState{
		ID: sagaID, CorrelationID: "t", CausationID: "t",
		CurrentStatus: saga.StatusProcessing, UpdatedAt: now, TimeoutAt: now.Add(time.Minute),
	}, &saga.SagaStep{
		ID: uuid.New().String(), SagaID: sagaID, StepName: "s", ExecutionOrder: 1,
		Status: saga.StepStatusStarted, Timestamp: now,
	}); err != nil {
		t.Fatalf("InitializeSaga: %v", err)
	}
	if err := store.CompleteSaga(ctx, tx, sagaID); err != nil {
		t.Fatalf("CompleteSaga: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
}

// TestUAT_CompletedCheckoutNotMarkedFailedByReconciliation verifies COMPLETED sagas are not failed.
func TestUAT_CompletedCheckoutNotMarkedFailedByReconciliation(t *testing.T) {
	pool := testutil.UATPool(t)
	ctx := context.Background()

	sagaID := uuid.New().String()
	_, err := pool.Exec(ctx, `
		INSERT INTO saga_states (
			saga_id, workflow, status, current_step, completed_steps, compensations,
			correlation_id, causation_id, retry_count, updated_at
		) VALUES ($1, 'checkout', 'COMPLETED', 'checkout.order_created', '[]', '[]', 'tr', 'tr', 0, now() - interval '20 minutes')
	`, sagaID)
	if err != nil {
		t.Fatal(err)
	}

	tag, err := pool.Exec(ctx, `
		UPDATE saga_states SET status = 'FAILED', updated_at = now()
		WHERE status = 'PROCESSING' AND updated_at < now() - interval '10 minutes'
	`)
	if err != nil {
		t.Fatal(err)
	}
	if tag.RowsAffected() != 0 {
		t.Fatalf("reconciliation should not touch COMPLETED sagas, updated %d rows", tag.RowsAffected())
	}

	var status string
	if err := pool.QueryRow(ctx, `SELECT status FROM saga_states WHERE saga_id = $1`, sagaID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "COMPLETED" {
		t.Fatalf("want COMPLETED, got %s", status)
	}
}

// TestUAT_CompletedSagaNeverClaimedForCompensation ensures compensation worker ignores COMPLETED.
func TestUAT_CompletedSagaNeverClaimedForCompensation(t *testing.T) {
	pool := testutil.UATPool(t)
	ctx := context.Background()
	store := saga.NewStore(pool)

	sagaID := uuid.New().String()
	now := time.Now().UTC()
	tx, _ := pool.Begin(ctx)
	_ = store.InitializeSaga(ctx, tx, &saga.SagaState{
		ID: sagaID, CorrelationID: "c", CausationID: "c",
		CurrentStatus: saga.StatusProcessing, UpdatedAt: now, TimeoutAt: now.Add(time.Minute),
	}, &saga.SagaStep{
		ID: uuid.New().String(), SagaID: sagaID, StepName: "s", ExecutionOrder: 1,
		Status: saga.StepStatusStarted, Timestamp: now,
	})
	_ = store.CompleteSaga(ctx, tx, sagaID)
	_ = tx.Commit(ctx)

	claimed, err := store.ClaimSagasForCompensation(ctx, 10, 10, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range claimed {
		if s.ID == sagaID {
			t.Fatal("COMPLETED saga must not be claimed for compensation")
		}
	}
}

// TestUAT_IdempotencyReplayAndFingerprintReject covers replay + mismatch rejection.
func TestUAT_IdempotencyReplayAndFingerprintReject(t *testing.T) {
	pool := testutil.UATPool(t)
	mw := middleware.Idempotency(pool)
	hits := 0
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"order":"ok"}`))
	}))

	key := "uat-key-" + uuid.NewString()
	req1 := httptest.NewRequest(http.MethodPost, "/checkout", bytes.NewBufferString(`{"sku":"A"}`))
	req1.Header.Set("Idempotency-Key", key)
	rec1 := httptest.NewRecorder()
	handler.ServeHTTP(rec1, req1)
	if rec1.Code != http.StatusCreated {
		t.Fatalf("first: %d", rec1.Code)
	}

	req2 := httptest.NewRequest(http.MethodPost, "/checkout", bytes.NewBufferString(`{"sku":"A"}`))
	req2.Header.Set("Idempotency-Key", key)
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusCreated || rec2.Header().Get("Idempotent-Replay") != "true" {
		t.Fatalf("replay: code=%d replay=%q", rec2.Code, rec2.Header().Get("Idempotent-Replay"))
	}
	if hits != 1 {
		t.Fatalf("handler hits want 1 got %d", hits)
	}

	req3 := httptest.NewRequest(http.MethodPost, "/checkout", bytes.NewBufferString(`{"sku":"B"}`))
	req3.Header.Set("Idempotency-Key", key)
	rec3 := httptest.NewRecorder()
	handler.ServeHTTP(rec3, req3)
	if rec3.Code != http.StatusConflict {
		t.Fatalf("fingerprint mismatch want 409 got %d body=%s", rec3.Code, rec3.Body.String())
	}
}

// TestUAT_StaleInProgressIdempotencyRecovered verifies reconciliation cleanup SQL.
func TestUAT_StaleInProgressIdempotencyRecovered(t *testing.T) {
	pool := testutil.UATPool(t)
	ctx := context.Background()

	key := "stale-" + uuid.NewString()
	_, err := pool.Exec(ctx, `
		INSERT INTO api_idempotency (idempotency_key, fingerprint, correlation_id, status, created_at, updated_at, expires_at)
		VALUES ($1, 'fp', 'tr', 'IN_PROGRESS', now() - interval '31 minutes', now() - interval '31 minutes', now() + interval '1 day')
	`, key)
	if err != nil {
		t.Fatal(err)
	}

	tag, err := pool.Exec(ctx, `
		DELETE FROM api_idempotency
		WHERE status = 'IN_PROGRESS' AND updated_at < now() - interval '30 minutes'
	`)
	if err != nil {
		t.Fatal(err)
	}
	if tag.RowsAffected() != 1 {
		t.Fatalf("expected 1 stale row deleted, got %d", tag.RowsAffected())
	}
}

// TestUAT_ChaosSagaCompleteLostUpdatePrevention verifies that a delayed saga completion
// will fail if the reconciliation worker has already marked it FAILED, preventing lost updates.
func TestUAT_ChaosSagaCompleteLostUpdatePrevention(t *testing.T) {
	pool := testutil.UATPool(t)
	ctx := context.Background()
	store := saga.NewStore(pool)

	sagaID := uuid.New().String()
	now := time.Now().UTC()

	tx, _ := pool.Begin(ctx)
	_ = store.InitializeSaga(ctx, tx, &saga.SagaState{
		ID: sagaID, CorrelationID: "chaos", CausationID: "chaos",
		CurrentStatus: saga.StatusProcessing, UpdatedAt: now, TimeoutAt: now.Add(time.Minute),
	}, &saga.SagaStep{
		ID: uuid.New().String(), SagaID: sagaID, StepName: "init", ExecutionOrder: 1,
		Status: saga.StepStatusStarted, Timestamp: now,
	})
	_ = tx.Commit(ctx)

	// Simulate Reconciliation Worker concurrently marking it FAILED
	_, err := pool.Exec(ctx, "UPDATE saga_states SET status = 'FAILED' WHERE saga_id = $1", sagaID)
	if err != nil {
		t.Fatal(err)
	}

	// Try to complete saga
	tx2, _ := pool.Begin(ctx)
	err = store.CompleteSaga(ctx, tx2, sagaID)
	if err == nil {
		t.Fatal("expected optimistic concurrency error, got nil")
	}
	_ = tx2.Rollback(ctx)

	expectedErr := fmt.Sprintf("optimistic concurrency failure: saga %s is in state FAILED, expected PROCESSING", sagaID)
	if err.Error() != expectedErr {
		t.Fatalf("unexpected error message: want %q, got %q", expectedErr, err.Error())
	}
}
