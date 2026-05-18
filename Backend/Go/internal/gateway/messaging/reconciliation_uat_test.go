package messaging

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"mypal/api/go/internal/gateway/testutil"
)

func TestUAT_ReconciliationDoesNotFailCompletedSagas(t *testing.T) {
	pool := testutil.UATPool(t)
	ctx := context.Background()
	w := NewReconciliationWorker(pool, time.Hour)

	sagaID := uuid.New().String()
	_, err := pool.Exec(ctx, `
		INSERT INTO saga_states (
			saga_id, workflow, status, current_step, completed_steps, compensations,
			correlation_id, causation_id, retry_count, updated_at
		) VALUES ($1, 'checkout', 'COMPLETED', 'done', '[]', '[]', 't', 't', 0, now() - interval '20 minutes')
	`, sagaID)
	if err != nil {
		t.Fatal(err)
	}

	w.cleanupStaleSagas(ctx)

	var status string
	if err := pool.QueryRow(ctx, `SELECT status FROM saga_states WHERE saga_id = $1`, sagaID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "COMPLETED" {
		t.Fatalf("COMPLETED saga must remain COMPLETED, got %s", status)
	}
}

func TestUAT_ReconciliationCleansStaleIdempotencyLocks(t *testing.T) {
	pool := testutil.UATPool(t)
	ctx := context.Background()
	w := NewReconciliationWorker(pool, time.Hour)

	key := "stale-lock-" + uuid.New().String()
	_, err := pool.Exec(ctx, `
		INSERT INTO api_idempotency (idempotency_key, fingerprint, correlation_id, status, created_at, updated_at, expires_at)
		VALUES ($1, 'fp', 'tr', 'IN_PROGRESS', now() - interval '31 minutes', now() - interval '31 minutes', now() + interval '1 day')
	`, key)
	if err != nil {
		t.Fatal(err)
	}

	w.cleanupStaleAPIIdempotency(ctx)

	var exists bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM api_idempotency WHERE idempotency_key = $1)`, key).Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists {
		t.Fatal("stale IN_PROGRESS idempotency row should be removed")
	}
}
