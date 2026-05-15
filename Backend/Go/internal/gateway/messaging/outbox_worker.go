package messaging

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	OutboxStatusPending    = "pending"
	OutboxStatusPublishing = "publishing"
	OutboxStatusPublished  = "published"
	OutboxStatusFailed     = "failed"

	defaultOutboxBatchSize             = 50
	defaultPublishingRecoveryThreshold = 5 * time.Minute
	maxPublishAttempts                 = 10
)

// OutboxWorker polls the outbox_events table and publishes to NATS safely.
type OutboxWorker struct {
	store                OutboxStore
	publisher            OutboxPublisher
	interval             time.Duration
	batchSize            int
	publishingStaleAfter time.Duration
	publishTimeout       time.Duration
	finalizeTimeout      time.Duration
}

func NewOutboxWorker(db *pgxpool.Pool, eb *EventBus, interval time.Duration) *OutboxWorker {
	return NewOutboxWorkerWithStore(NewPostgresOutboxStore(db), eb, interval)
}

func NewOutboxWorkerWithStore(store OutboxStore, publisher OutboxPublisher, interval time.Duration) *OutboxWorker {
	return &OutboxWorker{
		store:                store,
		publisher:            publisher,
		interval:             interval,
		batchSize:            defaultOutboxBatchSize,
		publishingStaleAfter: defaultPublishingRecoveryThreshold,
		publishTimeout:       30 * time.Second,
		finalizeTimeout:      5 * time.Second,
	}
}

// Start runs the dispatcher loop until the context is cancelled.
func (w *OutboxWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	slog.Info("outbox_worker: started dispatcher")

	for {
		select {
		case <-ctx.Done():
			slog.Info("outbox_worker: shutting down")
			return
		case <-ticker.C:
			// Process batch with an independent bounded context to allow graceful drain on shutdown
			batchCtx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			if err := w.processBatch(batchCtx); err != nil {
				slog.Error("outbox_worker: batch processing failed", "error", err)
			}
			cancel()
			
			if ctx.Err() != nil {
				slog.Info("outbox_worker: shutting down after batch drain")
				return
			}
		}
	}
}

func (w *OutboxWorker) processBatch(ctx context.Context) error {
	events, err := w.store.ClaimBatch(ctx, w.batchSize, w.publishingStaleAfter)
	if err != nil {
		return err
	}

	if len(events) == 0 {
		return nil
	}

	slog.Info("outbox_worker: processing batch", "count", len(events))

	var batchErrs []string
	for _, e := range events {
		subject := mapTypeToSubject(e.Type)

		publishCtx, publishCancel := context.WithTimeout(ctx, w.publishTimeout)
		publishErr := w.publisher.PublishOutbox(publishCtx, OutboxPublishMessage{
			EventID:   e.ID,
			EventType: e.Type,
			Subject:   subject,
			Data:      []byte(e.Payload),
			TraceID:   e.TraceID,
		})
		publishCancel()

		finalizeCtx, finalizeCancel := context.WithTimeout(context.Background(), w.finalizeTimeout)
		if publishErr != nil {
			if markErr := w.store.MarkFailed(finalizeCtx, e.ID, e.PublishAttempts, publishErr); markErr != nil {
				finalizeCancel()
				slog.Error(
					"outbox_worker: failed to persist publish failure",
					"event_id", e.ID,
					"trace_id", e.TraceID,
					"error", markErr,
				)
				batchErrs = append(batchErrs, fmt.Sprintf("%s mark failed: %v", e.ID, markErr))
				continue
			}
			finalizeCancel()
			slog.Warn(
				"outbox_worker: publish failed",
				"event_id", e.ID,
				"trace_id", e.TraceID,
				"attempt", e.PublishAttempts,
				"error", publishErr,
			)
			batchErrs = append(batchErrs, fmt.Sprintf("%s publish: %v", e.ID, publishErr))
			continue
		}

		if err := w.store.MarkPublished(finalizeCtx, e.ID); err != nil {
			finalizeCancel()
			slog.Error(
				"outbox_worker: failed to mark published",
				"event_id", e.ID,
				"trace_id", e.TraceID,
				"error", err,
			)
			batchErrs = append(batchErrs, fmt.Sprintf("%s mark published: %v", e.ID, err))
			continue
		}
		finalizeCancel()

		slog.Info(
			"outbox_worker: published event",
			"event_id", e.ID,
			"trace_id", e.TraceID,
			"subject", subject,
			"attempt", e.PublishAttempts,
		)
	}

	if len(batchErrs) > 0 {
		return fmt.Errorf("outbox publish batch completed with errors: %s", strings.Join(batchErrs, "; "))
	}

	return nil
}

func mapTypeToSubject(eventType string) string {
	switch eventType {
	case "order.created":
		return "order.created"
	case "inventory.reserved":
		return "inventory.reserved"
	default:
		return fmt.Sprintf("system.%s", eventType)
	}
}
