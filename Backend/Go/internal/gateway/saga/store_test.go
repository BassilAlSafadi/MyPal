package saga_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"mypal/api/go/internal/gateway/saga"
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

	schema := "saga_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
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
		CREATE TABLE saga_states (
			saga_id text PRIMARY KEY,
			workflow text NOT NULL DEFAULT 'checkout',
			status text NOT NULL,
			current_step text NOT NULL,
			completed_steps jsonb NOT NULL DEFAULT '[]',
			failed_step text,
			compensations jsonb NOT NULL DEFAULT '[]',
			correlation_id text NOT NULL DEFAULT '',
			causation_id text NOT NULL DEFAULT '',
			timeout_at timestamp with time zone NULL,
			failure_reason text,
			retry_count integer NOT NULL DEFAULT 0,
			updated_at timestamp without time zone NOT NULL
		);

		CREATE TABLE saga_steps (
			id text PRIMARY KEY,
			saga_id text NOT NULL REFERENCES saga_states(saga_id) ON DELETE CASCADE,
			step_name text NOT NULL,
			execution_order integer NOT NULL,
			status text NOT NULL,
			"timestamp" timestamp with time zone NOT NULL,
			compensation_required boolean NOT NULL DEFAULT false,
			compensation_completed boolean NOT NULL DEFAULT false,
			error_details text,
			UNIQUE(saga_id, execution_order)
		);
	`); err != nil {
		t.Fatalf("create tables: %v", err)
	}

	return pool
}

func TestSagaInitializationAndCrashRecovery(t *testing.T) {
	pool := newIntegrationPool(t)
	store := saga.NewStore(pool)
	ctx := context.Background()

	t.Run("Crash before orchestration start rolls back everything", func(t *testing.T) {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatalf("begin tx: %v", err)
		}

		sagaID := uuid.New().String()
		now := time.Now().UTC()
		state := &saga.SagaState{
			ID:            sagaID,
			CorrelationID: "trace-1",
			CausationID:   "trace-1",
			CurrentStatus: saga.StatusProcessing,
			CurrentStep:   "init",
			CreatedAt:     now,
			UpdatedAt:     now,
			TimeoutAt:     now.Add(10 * time.Minute),
		}
		step := &saga.SagaStep{
			ID:             uuid.New().String(),
			SagaID:         sagaID,
			StepName:       "init",
			ExecutionOrder: 1,
			Status:         saga.StepStatusStarted,
			Timestamp:      now,
		}

		if err := store.InitializeSaga(ctx, tx, state, step); err != nil {
			t.Fatalf("init saga: %v", err)
		}

		if err := tx.Rollback(ctx); err != nil {
			t.Fatalf("rollback tx: %v", err)
		}

		var count int
		if err := pool.QueryRow(ctx, "SELECT count(*) FROM saga_states WHERE saga_id = $1", sagaID).Scan(&count); err != nil {
			t.Fatalf("query: %v", err)
		}
		if count != 0 {
			t.Fatalf("expected 0 sagas, got %d", count)
		}
	})

	t.Run("Crash after persistence before publish (Commit succeeds)", func(t *testing.T) {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatalf("begin tx: %v", err)
		}

		sagaID := uuid.New().String()
		now := time.Now().UTC()
		state := &saga.SagaState{
			ID:            sagaID,
			CorrelationID: "trace-2",
			CausationID:   "trace-2",
			CurrentStatus: saga.StatusProcessing,
			CurrentStep:   "init",
			CreatedAt:     now,
			UpdatedAt:     now,
			TimeoutAt:     now.Add(10 * time.Minute),
		}
		step := &saga.SagaStep{
			ID:             uuid.New().String(),
			SagaID:         sagaID,
			StepName:       "init",
			ExecutionOrder: 1,
			Status:         saga.StepStatusStarted,
			Timestamp:      now,
		}

		if err := store.InitializeSaga(ctx, tx, state, step); err != nil {
			t.Fatalf("init saga: %v", err)
		}

		if err := tx.Commit(ctx); err != nil {
			t.Fatalf("commit tx: %v", err)
		}

		var count int
		if err := pool.QueryRow(ctx, "SELECT count(*) FROM saga_states WHERE saga_id = $1", sagaID).Scan(&count); err != nil {
			t.Fatalf("query: %v", err)
		}
		if count != 1 {
			t.Fatalf("expected 1 saga, got %d", count)
		}

		var currentStep string
		if err := pool.QueryRow(ctx, "SELECT current_step FROM saga_states WHERE saga_id = $1", sagaID).Scan(&currentStep); err != nil {
			t.Fatalf("query current_step: %v", err)
		}
		if currentStep != "init" {
			t.Fatalf("expected current_step 'init', got %q", currentStep)
		}
	})
}

func TestAppendOnlyStepIntegrityAndReplaySafety(t *testing.T) {
	pool := newIntegrationPool(t)
	store := saga.NewStore(pool)
	ctx := context.Background()

	tx, _ := pool.Begin(ctx)
	sagaID := uuid.New().String()
	now := time.Now().UTC()
	store.InitializeSaga(ctx, tx, &saga.SagaState{
		ID:            sagaID,
		CorrelationID: "trace-3",
		CausationID:   "trace-3",
		CurrentStatus: saga.StatusProcessing,
		CurrentStep:   "init",
		CreatedAt:     now,
		UpdatedAt:     now,
		TimeoutAt:     now.Add(10 * time.Minute),
	}, &saga.SagaStep{
		ID:             uuid.New().String(),
		SagaID:         sagaID,
		StepName:       "init",
		ExecutionOrder: 1,
		Status:         saga.StepStatusStarted,
		Timestamp:      now,
	})
	tx.Commit(ctx)

	t.Run("Log valid step", func(t *testing.T) {
		tx, _ := pool.Begin(ctx)
		step := &saga.SagaStep{
			ID:             uuid.New().String(),
			SagaID:         sagaID,
			StepName:       "inventory_reserved",
			ExecutionOrder: 2,
			Status:         saga.StepStatusCompleted,
			Timestamp:      time.Now().UTC(),
		}
		if err := store.LogStep(ctx, tx, step); err != nil {
			t.Fatalf("LogStep failed: %v", err)
		}
		tx.Commit(ctx)

		var currentStep string
		pool.QueryRow(ctx, "SELECT current_step FROM saga_states WHERE saga_id = $1", sagaID).Scan(&currentStep)
		if currentStep != "inventory_reserved" {
			t.Fatalf("state current_step not updated")
		}
	})

	t.Run("Duplicate replay handling via unique constraints", func(t *testing.T) {
		tx, _ := pool.Begin(ctx)
		step := &saga.SagaStep{
			ID:             uuid.New().String(),
			SagaID:         sagaID,
			StepName:       "inventory_reserved_duplicate",
			ExecutionOrder: 2,
			Status:         saga.StepStatusCompleted,
			Timestamp:      time.Now().UTC(),
		}
		err := store.LogStep(ctx, tx, step)
		if err == nil {
			t.Fatalf("Expected constraint violation for duplicate step execution order")
		}
		tx.Rollback(ctx)
	})

	t.Run("Stale recovery via TransitionSagaStatus", func(t *testing.T) {
		tx, _ := pool.Begin(ctx)
		reason := "timeout_exceeded"
		if err := store.TransitionSagaStatus(ctx, tx, sagaID, saga.StatusFailed, &reason); err != nil {
			t.Fatalf("TransitionSagaStatus failed: %v", err)
		}
		tx.Commit(ctx)

		var status, dbReason string
		pool.QueryRow(ctx, "SELECT status, failure_reason FROM saga_states WHERE saga_id = $1", sagaID).Scan(&status, &dbReason)
		if status != string(saga.StatusFailed) || dbReason != reason {
			t.Fatalf("saga state not transitioned correctly")
		}
	})
}

func TestCompleteSagaTerminalState(t *testing.T) {
	pool := newIntegrationPool(t)
	store := saga.NewStore(pool)
	ctx := context.Background()

	sagaID := uuid.New().String()
	now := time.Now().UTC()
	tx, _ := pool.Begin(ctx)
	if err := store.InitializeSaga(ctx, tx, &saga.SagaState{
		ID:            sagaID,
		CorrelationID: "t",
		CausationID:   "t",
		CurrentStatus: saga.StatusProcessing,
		CurrentStep:   "s",
		CreatedAt:     now,
		UpdatedAt:     now,
		TimeoutAt:     now.Add(time.Minute),
	}, &saga.SagaStep{
		ID:             uuid.New().String(),
		SagaID:         sagaID,
		StepName:       "s",
		ExecutionOrder: 1,
		Status:         saga.StepStatusStarted,
		Timestamp:      now,
	}); err != nil {
		t.Fatalf("init: %v", err)
	}
	if err := store.CompleteSaga(ctx, tx, sagaID); err != nil {
		t.Fatalf("complete: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit: %v", err)
	}

	var st string
	if err := pool.QueryRow(ctx, `SELECT status FROM saga_states WHERE saga_id = $1`, sagaID).Scan(&st); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if st != string(saga.StatusCompleted) {
		t.Fatalf("want COMPLETED, got %q", st)
	}
}

func TestCompensationRetrySchedulesFutureEligibility(t *testing.T) {
	pool := newIntegrationPool(t)
	store := saga.NewStore(pool)
	ctx := context.Background()

	sagaID := uuid.New().String()
	now := time.Now().UTC()
	tx, _ := pool.Begin(ctx)
	if err := store.InitializeSaga(ctx, tx, &saga.SagaState{
		ID:            sagaID,
		CorrelationID: "t",
		CausationID:   "t",
		CurrentStatus: saga.StatusFailed,
		CurrentStep:   "s",
		CreatedAt:     now,
		UpdatedAt:     now,
		TimeoutAt:     now.Add(time.Minute),
		RetryCount:    2,
	}, &saga.SagaStep{
		ID:             uuid.New().String(),
		SagaID:         sagaID,
		StepName:       "s",
		ExecutionOrder: 1,
		Status:         saga.StepStatusCompleted,
		Timestamp:      now,
	}); err != nil {
		t.Fatalf("init: %v", err)
	}
	if err := store.ScheduleCompensationRetry(ctx, tx, sagaID, "boom", 2*time.Second); err != nil {
		t.Fatalf("schedule: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit: %v", err)
	}

	var cnt int
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM saga_states
		WHERE saga_id = $1 AND status = 'FAILED' AND updated_at > now()
	`, sagaID).Scan(&cnt); err != nil {
		t.Fatalf("query: %v", err)
	}
	if cnt != 1 {
		t.Fatalf("expected saga row not yet eligible (future updated_at), count=%d", cnt)
	}
}
