package saga_test

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"mypal/api/go/internal/gateway/saga"
)

type MockHandler struct {
	attempts int32
	err      error
}

func (m *MockHandler) Compensate(ctx context.Context, state saga.SagaState) error {
	atomic.AddInt32(&m.attempts, 1)
	return m.err
}

func TestCompensationWorker_SuccessFlow(t *testing.T) {
	pool := newIntegrationPool(t)
	store := saga.NewStore(pool)
	ctx := context.Background()

	// Initialize FAILED saga
	sagaID := uuid.New().String()
	now := time.Now().UTC()
	tx, _ := pool.Begin(ctx)
	store.InitializeSaga(ctx, tx, &saga.SagaState{
		ID:            sagaID,
		CorrelationID: "trace-comp-1",
		CausationID:   "trace-comp-1",
		CurrentStatus: saga.StatusFailed,
		CurrentStep:   "checkout.started",
		CreatedAt:     now,
		UpdatedAt:     now,
		TimeoutAt:     now.Add(10 * time.Minute),
	}, &saga.SagaStep{
		ID:             uuid.New().String(),
		SagaID:         sagaID,
		StepName:       "checkout.started",
		ExecutionOrder: 1,
		Status:         saga.StepStatusCompleted,
		Timestamp:      now,
	})
	tx.Commit(ctx)

	worker := saga.NewCompensationWorker(pool, 1*time.Millisecond)
	handler := &MockHandler{err: nil}
	worker.SetDefaultHandler(handler)

	ctxTimeout, cancel := context.WithTimeout(ctx, 50*time.Millisecond)
	defer cancel()
	worker.Start(ctxTimeout)

	if atomic.LoadInt32(&handler.attempts) != 1 {
		t.Fatalf("expected 1 attempt, got %d", handler.attempts)
	}

	var status string
	pool.QueryRow(ctx, "SELECT status FROM saga_states WHERE saga_id = $1", sagaID).Scan(&status)
	if status != string(saga.StatusCompensated) {
		t.Fatalf("expected COMPENSATED, got %s", status)
	}
}

func TestCompensationWorker_RetryExhaustionAndDLQ(t *testing.T) {
	pool := newIntegrationPool(t)
	store := saga.NewStore(pool)
	ctx := context.Background()

	sagaID := uuid.New().String()
	now := time.Now().UTC()
	tx, _ := pool.Begin(ctx)
	store.InitializeSaga(ctx, tx, &saga.SagaState{
		ID:            sagaID,
		CorrelationID: "trace-dlq",
		CausationID:   "trace-dlq",
		CurrentStatus: saga.StatusFailed,
		CurrentStep:   "checkout.started",
		CreatedAt:     now,
		UpdatedAt:     now,
		TimeoutAt:     now.Add(10 * time.Minute),
		RetryCount:    9, // Starts at 9, max is 10
	}, &saga.SagaStep{
		ID:             uuid.New().String(),
		SagaID:         sagaID,
		StepName:       "checkout.started",
		ExecutionOrder: 1,
		Status:         saga.StepStatusCompleted,
		Timestamp:      now,
	})
	tx.Commit(ctx)

	worker := saga.NewCompensationWorker(pool, 1*time.Millisecond)
	handler := &MockHandler{err: errors.New("poison message")}
	worker.SetDefaultHandler(handler)

	// Batch 1: Retry count goes to 10. Handler fails. Escalates to DLQ.
	ctxTimeout, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	worker.Start(ctxTimeout)

	var status, reason string
	pool.QueryRow(ctx, "SELECT status, failure_reason FROM saga_states WHERE saga_id = $1", sagaID).Scan(&status, &reason)
	if status != string(saga.StatusDeadLetter) {
		t.Fatalf("expected DEAD_LETTER, got %s", status)
	}
}

func TestCompensationWorker_ConcurrentExecution(t *testing.T) {
	pool := newIntegrationPool(t)
	store := saga.NewStore(pool)
	ctx := context.Background()

	sagaID := uuid.New().String()
	now := time.Now().UTC()
	tx, _ := pool.Begin(ctx)
	store.InitializeSaga(ctx, tx, &saga.SagaState{
		ID:            sagaID,
		CorrelationID: "trace-conc",
		CausationID:   "trace-conc",
		CurrentStatus: saga.StatusFailed,
		CurrentStep:   "checkout.started",
		CreatedAt:     now,
		UpdatedAt:     now,
		TimeoutAt:     now.Add(10 * time.Minute),
	}, &saga.SagaStep{
		ID:             uuid.New().String(),
		SagaID:         sagaID,
		StepName:       "checkout.started",
		ExecutionOrder: 1,
		Status:         saga.StepStatusCompleted,
		Timestamp:      now,
	})
	tx.Commit(ctx)

	handler := &MockHandler{err: nil}
	
	var wg sync.WaitGroup
	// Spin up 5 concurrent workers
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			worker := saga.NewCompensationWorker(pool, 10*time.Millisecond)
			worker.SetDefaultHandler(handler)
			ctxTimeout, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
			defer cancel()
			worker.Start(ctxTimeout)
		}()
	}
	wg.Wait()

	// Ensure the handler was only called ONCE due to FOR UPDATE SKIP LOCKED
	if atomic.LoadInt32(&handler.attempts) != 1 {
		t.Fatalf("expected exactly 1 attempt from concurrent workers, got %d", handler.attempts)
	}
}
