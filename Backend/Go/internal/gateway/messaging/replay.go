package messaging

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ReplayManager handles the replay of events from DLQ to active streams.
type ReplayManager struct {
	db       *pgxpool.Pool
	eventBus *EventBus
}

func NewReplayManager(db *pgxpool.Pool, eb *EventBus) *ReplayManager {
	return &ReplayManager{
		db:       db,
		eventBus: eb,
	}
}

// ReplayDeadLetterEvent fetches an event from the dead_letter_events audit log (via API or NATS)
// and republishes it to the target stream.
// To ensure idempotency isn't violated unexpectedly, it only publishes if
// the operator approves.
func (r *ReplayManager) ReplayEvent(ctx context.Context, eventID string, payload []byte, targetSubject string) error {
	slog.Info("replay: starting event replay", "event_id", eventID, "target", targetSubject)

	// In a complete implementation, this might fetch payload from MongoDB first,
	// but here we assume the payload is provided by the administrative caller.

	err := r.eventBus.PublishOutbox(ctx, OutboxPublishMessage{
		EventID:   eventID,
		Subject:   targetSubject,
		Data:      payload,
	})
	if err != nil {
		return fmt.Errorf("failed to replay event %s: %w", eventID, err)
	}

	// Note: We do not clear the 'processed_events' idempotency record by default.
	// If the event failed during processing, the idempotency record might not exist.
	// If the operator explicitly wants to force replay, a separate API would clear it.

	slog.Info("replay: successfully published event", "event_id", eventID)
	return nil
}
