package saga

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

var compensatorTracer = otel.Tracer("saga-compensator")

// CompensationHandler defines how a specific type of saga is compensated.
type CompensationHandler interface {
	Compensate(ctx context.Context, state SagaState) error
}

// CompensationWorker runs background jobs to durably execute compensations.
type CompensationWorker struct {
	db             *pgxpool.Pool
	store          *Store
	handlers       map[string]CompensationHandler // Key: Step Prefix or Saga Type
	interval       time.Duration
	maxAttempts    int
	stalledTimeout time.Duration
	defaultHandler CompensationHandler
}

func compensationRetryDelay(retryCount int) time.Duration {
	if retryCount < 1 {
		retryCount = 1
	}
	secs := 1
	for i := 1; i < retryCount && i < 12; i++ {
		secs *= 2
		if secs > 300 {
			return 5 * time.Minute
		}
	}
	return time.Duration(secs) * time.Second
}

func NewCompensationWorker(db *pgxpool.Pool, interval time.Duration) *CompensationWorker {
	return &CompensationWorker{
		db:             db,
		store:          NewStore(db),
		handlers:       make(map[string]CompensationHandler),
		interval:       interval,
		maxAttempts:    10,
		stalledTimeout: 5 * time.Minute,
	}
}

// SetDefaultHandler sets the handler for unknown saga types (useful since we only have checkout currently).
func (w *CompensationWorker) SetDefaultHandler(h CompensationHandler) {
	w.defaultHandler = h
}

// Start runs the compensation loop.
func (w *CompensationWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	slog.Info("compensation_worker: started")

	for {
		select {
		case <-ctx.Done():
			slog.Info("compensation_worker: shutting down")
			return
		case <-ticker.C:
			// Run batch with a bounded context
			batchCtx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			w.processBatch(batchCtx)
			cancel()

			if ctx.Err() != nil {
				slog.Info("compensation_worker: shutting down after batch drain")
				return
			}
		}
	}
}

func (w *CompensationWorker) processBatch(ctx context.Context) {
	sagas, err := w.store.ClaimSagasForCompensation(ctx, 10, w.maxAttempts, w.stalledTimeout)
	if err != nil {
		slog.Error("compensation_worker: failed to claim sagas", "error", err)
		return
	}

	for _, s := range sagas {
		w.compensateSaga(ctx, s)
	}
}

func (w *CompensationWorker) compensateSaga(ctx context.Context, state SagaState) {
	// 1. Observability Setup
	ctx, span := compensatorTracer.Start(ctx, "saga.Compensate", trace.WithAttributes(
		attribute.String("saga.id", state.ID),
		attribute.String("saga.correlation_id", state.CorrelationID),
		attribute.Int("saga.retry_count", state.RetryCount),
	))
	defer span.End()

	slog.Info("compensation_worker: starting compensation", "saga_id", state.ID, "retry_count", state.RetryCount)

	// Determine Handler
	handler := w.defaultHandler
	if handler == nil {
		err := fmt.Errorf("no compensation handler found for state %s", state.CurrentStep)
		w.recordCompensationFailure(ctx, state, err)
		return
	}

	// 2. Step Tracking: Started
	startedStep := &SagaStep{
		ID:             uuid.New().String(),
		SagaID:         state.ID,
		StepName:       "compensation.executing",
		ExecutionOrder: 1000 + state.RetryCount*10, // Ensure sequential ordering
		Status:         StepStatusStarted,
		Timestamp:      time.Now().UTC(),
	}

	tx, err := w.db.Begin(ctx)
	if err != nil {
		slog.Error("compensation_worker: failed to begin tx", "saga_id", state.ID, "error", err)
		return
	}

	if err := w.store.LogStep(ctx, tx, startedStep); err != nil {
		slog.Error("compensation_worker: failed to log start step", "saga_id", state.ID, "error", err)
		tx.Rollback(ctx)
		return
	}
	tx.Commit(ctx)

	// 3. Execute Compensation
	compErr := handler.Compensate(ctx, state)

	// 4. Record Results
	if compErr != nil {
		w.recordCompensationFailure(ctx, state, compErr)
	} else {
		w.recordCompensationSuccess(ctx, state)
	}
}

func (w *CompensationWorker) recordCompensationSuccess(ctx context.Context, state SagaState) {
	tx, err := w.db.Begin(ctx)
	if err != nil {
		slog.Error("compensation_worker: failed to begin tx for success", "saga_id", state.ID, "error", err)
		return
	}
	defer tx.Rollback(ctx)

	completedStep := &SagaStep{
		ID:             uuid.New().String(),
		SagaID:         state.ID,
		StepName:       "compensation.completed",
		ExecutionOrder: 1000 + state.RetryCount*10 + 1,
		Status:         StepStatusCompleted,
		Timestamp:      time.Now().UTC(),
	}

	if err := w.store.LogStep(ctx, tx, completedStep); err != nil {
		slog.Error("compensation_worker: failed to log completion step", "saga_id", state.ID, "error", err)
		return
	}

	if err := w.store.TransitionSagaStatus(ctx, tx, state.ID, StatusCompensated, nil); err != nil {
		slog.Error("compensation_worker: failed to transition saga to compensated", "saga_id", state.ID, "error", err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("compensation_worker: failed to commit success", "saga_id", state.ID, "error", err)
		return
	}

	slog.Info("compensation_worker: successfully compensated saga", "saga_id", state.ID)
}

func (w *CompensationWorker) recordCompensationFailure(ctx context.Context, state SagaState, compErr error) {
	slog.Error("compensation_worker: compensation failed", "saga_id", state.ID, "error", compErr)

	tx, err := w.db.Begin(ctx)
	if err != nil {
		slog.Error("compensation_worker: failed to begin tx for failure", "saga_id", state.ID, "error", err)
		return
	}
	defer tx.Rollback(ctx)

	errDetails := compErr.Error()
	failedStep := &SagaStep{
		ID:             uuid.New().String(),
		SagaID:         state.ID,
		StepName:       "compensation.failed",
		ExecutionOrder: 1000 + state.RetryCount*10 + 1,
		Status:         StepStatusFailed,
		Timestamp:      time.Now().UTC(),
		ErrorDetails:   &errDetails,
	}

	if err := w.store.LogStep(ctx, tx, failedStep); err != nil {
		slog.Error("compensation_worker: failed to log failure step", "saga_id", state.ID, "error", err)
		return
	}

	// 5. DLQ Escalation / Retry Limits
	if state.RetryCount >= w.maxAttempts {
		slog.Warn("compensation_worker: escalating to DLQ", "saga_id", state.ID, "retry_count", state.RetryCount)
		if err := w.store.EscalateToDLQ(ctx, state.ID, errDetails); err != nil {
			slog.Error("compensation_worker: failed to escalate to DLQ", "saga_id", state.ID, "error", err)
			return
		}
	} else {
		delay := compensationRetryDelay(state.RetryCount)
		if err := w.store.ScheduleCompensationRetry(ctx, tx, state.ID, errDetails, delay); err != nil {
			slog.Error("compensation_worker: failed to schedule compensation retry", "saga_id", state.ID, "error", err)
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("compensation_worker: failed to commit failure", "saga_id", state.ID, "error", err)
	}
}
