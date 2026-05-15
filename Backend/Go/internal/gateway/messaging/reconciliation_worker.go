package messaging

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ReconciliationWorker runs background jobs to repair system state inconsistencies.
type ReconciliationWorker struct {
	db                      *pgxpool.Pool
	outboxRecovery          OutboxRecoveryStore
	interval                time.Duration
	outboxRecoveryBatchSize int
	publishingRecoveryAfter time.Duration
}

func NewReconciliationWorker(db *pgxpool.Pool, interval time.Duration) *ReconciliationWorker {
	return &ReconciliationWorker{
		db:                      db,
		outboxRecovery:          NewPostgresOutboxStore(db),
		interval:                interval,
		outboxRecoveryBatchSize: defaultOutboxBatchSize,
		publishingRecoveryAfter: defaultPublishingRecoveryThreshold,
	}
}

// Start runs the reconciliation loop.
func (w *ReconciliationWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	slog.Info("reconciliation_worker: started")

	for {
		select {
		case <-ctx.Done():
			slog.Info("reconciliation_worker: shutting down")
			return
		case <-ticker.C:
			if ctx.Err() != nil {
				slog.Info("reconciliation_worker: shutting down")
				return
			}
			w.runJobs(ctx)
		}
	}
}

func (w *ReconciliationWorker) runJobs(ctx context.Context) {
	slog.Info("reconciliation_worker: running health checks")

	w.recoverStuckOutboxEvents(ctx)
	w.cleanupStaleSagas(ctx)
	w.cleanupStaleAPIIdempotency(ctx)
	// Additional jobs: orphan reservation cleanup, inventory drift detection.
}

func (w *ReconciliationWorker) cleanupStaleAPIIdempotency(ctx context.Context) {
	res, err := w.db.Exec(ctx, `
		DELETE FROM api_idempotency
		WHERE status = 'IN_PROGRESS'
		  AND updated_at < now() - interval '30 minutes'
	`)
	if err != nil {
		slog.Error("reconciliation_worker: failed to clean stale api idempotency rows", "error", err)
		return
	}
	if res.RowsAffected() > 0 {
		slog.Warn("reconciliation_worker: removed stale in-progress idempotency locks", "count", res.RowsAffected())
	}
}

func (w *ReconciliationWorker) recoverStuckOutboxEvents(ctx context.Context) {
	// Recover events claimed by a worker that crashed after committing the claim
	// but before completing the NATS publish/finalization phase.
	recovered, err := w.outboxRecovery.RecoverStalePublishing(
		ctx,
		w.outboxRecoveryBatchSize,
		w.publishingRecoveryAfter,
	)
	if err != nil {
		slog.Error("reconciliation_worker: failed to recover outbox events", "error", err)
		return
	}

	if recovered > 0 {
		slog.Warn(
			"reconciliation_worker: recovered stale publishing outbox events",
			"count", recovered,
			"stale_after_ms", w.publishingRecoveryAfter.Milliseconds(),
			"owner", "reconciliation_worker",
		)
	}
}

func (w *ReconciliationWorker) cleanupStaleSagas(ctx context.Context) {
	// Transition sagas stuck in PROCESSING for > 10 minutes to FAILED to trigger compensations.
	res, err := w.db.Exec(ctx, `
		UPDATE saga_states
		SET status = 'FAILED', updated_at = now()
		WHERE status = 'PROCESSING'
		  AND updated_at < now() - interval '10 minutes'
	`)
	if err != nil {
		slog.Error("reconciliation_worker: failed to clean up stale sagas", "error", err)
		return
	}

	if res.RowsAffected() > 0 {
		slog.Warn("reconciliation_worker: marked stale sagas as failed", "count", res.RowsAffected())
	}
}
