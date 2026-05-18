package messaging

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type OutboxEvent struct {
	ID              string
	Type            string
	Payload         string
	TraceID         string
	PublishAttempts int
}

type OutboxStore interface {
	ClaimBatch(ctx context.Context, limit int, publishingStaleAfter time.Duration) ([]OutboxEvent, error)
	MarkPublished(ctx context.Context, eventID string) error
	MarkFailed(ctx context.Context, eventID string, publishAttempt int, publishErr error) error
}

type OutboxRecoveryStore interface {
	RecoverStalePublishing(ctx context.Context, limit int, publishingStaleAfter time.Duration) (int64, error)
}

type PostgresOutboxStore struct {
	db *pgxpool.Pool
}

func NewPostgresOutboxStore(db *pgxpool.Pool) *PostgresOutboxStore {
	return &PostgresOutboxStore{db: db}
}

func (s *PostgresOutboxStore) ClaimBatch(ctx context.Context, limit int, _ time.Duration) ([]OutboxEvent, error) {
	if limit <= 0 {
		limit = defaultOutboxBatchSize
	}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("claim outbox batch begin: %w", err)
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		WITH candidate AS (
			SELECT id
			FROM outbox_events
			WHERE processed_at IS NULL
			  AND publish_status IN ('pending', 'failed')
			  AND publish_attempts < $2
			ORDER BY created_at ASC
			LIMIT $1
			FOR UPDATE SKIP LOCKED
		)
		UPDATE outbox_events AS o
		SET publish_status = 'publishing',
			publish_attempts = o.publish_attempts + 1,
			last_publish_attempt_at = now(),
			error = NULL,
			updated_at = now()
		FROM candidate
		WHERE o.id = candidate.id
		RETURNING o.id::text, o.type, o.payload::text, o.trace_id, o.publish_attempts
	`, limit, maxPublishAttempts)
	if err != nil {
		return nil, fmt.Errorf("claim outbox batch query: %w", err)
	}
	defer rows.Close()

	var events []OutboxEvent
	for rows.Next() {
		var e OutboxEvent
		if err := rows.Scan(&e.ID, &e.Type, &e.Payload, &e.TraceID, &e.PublishAttempts); err != nil {
			return nil, fmt.Errorf("claim outbox batch scan: %w", err)
		}
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("claim outbox batch rows: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("claim outbox batch commit: %w", err)
	}

	return events, nil
}

func (s *PostgresOutboxStore) RecoverStalePublishing(ctx context.Context, limit int, publishingStaleAfter time.Duration) (int64, error) {
	if limit <= 0 {
		limit = defaultOutboxBatchSize
	}
	staleSeconds := int64(publishingStaleAfter.Seconds())
	if staleSeconds < 0 {
		staleSeconds = 0
	}

	tag, err := s.db.Exec(ctx, `
		WITH stale AS (
			SELECT id
			FROM outbox_events
			WHERE processed_at IS NULL
			  AND publish_status = 'publishing'
			  AND updated_at < now() - ($2::bigint * interval '1 second')
			ORDER BY updated_at ASC, created_at ASC
			LIMIT $1
			FOR UPDATE SKIP LOCKED
		)
		UPDATE outbox_events AS o
		SET publish_status = 'pending',
			error = NULL,
			updated_at = now()
		FROM stale
		WHERE o.id = stale.id
	`, limit, staleSeconds)
	if err != nil {
		return 0, fmt.Errorf("recover stale outbox publishing rows: %w", err)
	}

	return tag.RowsAffected(), nil
}

func (s *PostgresOutboxStore) MarkPublished(ctx context.Context, eventID string) error {
	tag, err := s.db.Exec(ctx, `
		UPDATE outbox_events
		SET publish_status = 'published',
			processed_at = COALESCE(processed_at, now()),
			error = NULL,
			updated_at = now()
		WHERE id = $1::uuid
		  AND publish_status <> 'published'
	`, eventID)
	if err != nil {
		return fmt.Errorf("mark outbox published: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil
	}
	return nil
}

func (s *PostgresOutboxStore) MarkFailed(ctx context.Context, eventID string, publishAttempt int, publishErr error) error {
	message := ""
	if publishErr != nil {
		message = publishErr.Error()
	}

	tag, err := s.db.Exec(ctx, `
		UPDATE outbox_events
		SET publish_status = 'failed',
			error = $3,
			updated_at = now()
		WHERE id = $1::uuid
		  AND publish_status = 'publishing'
		  AND publish_attempts = $2
	`, eventID, publishAttempt, message)
	if err != nil {
		return fmt.Errorf("mark outbox failed: %w", err)
	}
	if tag.RowsAffected() == 0 {
		slog.Warn("outbox_store: mark failed affected zero rows", "event_id", eventID, "attempt", publishAttempt, "publish_error", publishErr)
		return nil
	}
	return nil
}
