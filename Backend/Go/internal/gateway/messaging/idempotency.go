package messaging

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// IdempotencyManager enforces system-wide event deduplication using the processed_events table.
type IdempotencyManager struct {
	db *pgxpool.Pool
}

func NewIdempotencyManager(db *pgxpool.Pool) *IdempotencyManager {
	return &IdempotencyManager{db: db}
}

// IsProcessed checks if an event has already been processed by the given consumer.
// Returns true if processed, false if not, or an error if the check fails.
func (im *IdempotencyManager) IsProcessed(ctx context.Context, eventID string, consumer string) (bool, error) {
	var exists bool
	err := im.db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM processed_events WHERE event_id = $1 AND consumer = $2
		)
	`, eventID, consumer).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("idempotency check failed: %w", err)
	}
	return exists, nil
}

// MarkProcessed records that an event has been successfully handled by the consumer.
func (im *IdempotencyManager) MarkProcessed(ctx context.Context, eventID string, consumer string) error {
	_, err := im.db.Exec(ctx, `
		INSERT INTO processed_events (event_id, consumer, processed_at)
		VALUES ($1, $2, now())
		ON CONFLICT (event_id, consumer) DO NOTHING
	`, eventID, consumer)
	if err != nil {
		return fmt.Errorf("failed to mark event processed: %w", err)
	}
	return nil
}

// ExecuteWithIdempotency atomically checks if an event has been processed, and if not, executes the handler
// within a transaction that records the processing. If the handler fails, the transaction is rolled back.
func (im *IdempotencyManager) ExecuteWithIdempotency(ctx context.Context, eventID string, consumer string, handler func(context.Context) error) (bool, error) {
	tx, err := im.db.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("idempotency tx begin failed: %w", err)
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		INSERT INTO processed_events (event_id, consumer, processed_at)
		VALUES ($1, $2, now())
		ON CONFLICT (event_id, consumer) DO NOTHING
	`, eventID, consumer)
	if err != nil {
		return false, fmt.Errorf("idempotency check failed: %w", err)
	}

	if tag.RowsAffected() == 0 {
		return false, nil // already processed
	}

	if err := handler(ctx); err != nil {
		return false, err // Rolls back, allowing retry
	}

	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("idempotency tx commit failed: %w", err)
	}
	return true, nil
}
