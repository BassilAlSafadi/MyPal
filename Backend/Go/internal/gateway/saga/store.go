package saga

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store provides operations for durable saga persistence.
type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

// InitializeSaga durably starts a saga and logs the initial step.
func (s *Store) InitializeSaga(ctx context.Context, tx pgx.Tx, state *SagaState, step *SagaStep) error {
	workflow := state.Workflow
	if workflow == "" {
		workflow = "checkout"
	}

	completedJSON, err := json.Marshal([]string{step.StepName})
	if err != nil {
		return fmt.Errorf("marshal completed_steps: %w", err)
	}

	var timeout any
	if !state.TimeoutAt.IsZero() {
		timeout = state.TimeoutAt
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO saga_states (
			saga_id, workflow, status, current_step, completed_steps, failed_step, compensations,
			correlation_id, causation_id, timeout_at, failure_reason, retry_count, updated_at
		) VALUES ($1, $2, $3, $4, $5::jsonb, NULL, '[]'::jsonb, $6, $7, $8, NULL, $9, $10)
	`, state.ID, workflow, state.CurrentStatus, step.StepName, string(completedJSON),
		state.CorrelationID, state.CausationID, timeout, state.RetryCount, state.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to insert saga state: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO saga_steps (
			id, saga_id, step_name, execution_order, status,
			"timestamp", compensation_required, compensation_completed, error_details
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, step.ID, step.SagaID, step.StepName, step.ExecutionOrder, step.Status,
		step.Timestamp, step.CompensationRequired, step.CompensationCompleted, step.ErrorDetails)
	if err != nil {
		return fmt.Errorf("failed to insert initial saga step: %w", err)
	}

	return nil
}

// LogStep appends a step to the step log and updates the current step on the saga state.
func (s *Store) LogStep(ctx context.Context, tx pgx.Tx, step *SagaStep) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO saga_steps (
			id, saga_id, step_name, execution_order, status,
			"timestamp", compensation_required, compensation_completed, error_details
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, step.ID, step.SagaID, step.StepName, step.ExecutionOrder, step.Status,
		step.Timestamp, step.CompensationRequired, step.CompensationCompleted, step.ErrorDetails)
	if err != nil {
		return fmt.Errorf("failed to insert saga step: %w", err)
	}

	_, err = tx.Exec(ctx, `
		UPDATE saga_states
		SET current_step = $2,
		    completed_steps = COALESCE(completed_steps, '[]'::jsonb) || to_jsonb($3::text),
		    updated_at = $4
		WHERE saga_id = $1
	`, step.SagaID, step.StepName, step.StepName, step.Timestamp)
	if err != nil {
		return fmt.Errorf("failed to update saga current_step: %w", err)
	}

	return nil
}

// CompleteSaga marks a successfully finished saga as COMPLETED (durable terminal state).
func (s *Store) CompleteSaga(ctx context.Context, tx pgx.Tx, sagaID string) error {
	tag, err := tx.Exec(ctx, `
		UPDATE saga_states
		SET status = $2,
		    updated_at = now()
		WHERE saga_id = $1
		  AND status = $3
	`, sagaID, StatusCompleted, StatusProcessing)
	if err != nil {
		return fmt.Errorf("failed to complete saga: %w", err)
	}

	if tag.RowsAffected() == 0 {
		var currentStatus string
		err := tx.QueryRow(ctx, "SELECT status FROM saga_states WHERE saga_id = $1", sagaID).Scan(&currentStatus)
		if err != nil {
			return fmt.Errorf("optimistic concurrency failure: saga %s not found", sagaID)
		}
		return fmt.Errorf("optimistic concurrency failure: saga %s is in state %s, expected %s", sagaID, currentStatus, StatusProcessing)
	}

	return nil
}

// TransitionSagaStatus durably changes the overall saga status.
func (s *Store) TransitionSagaStatus(ctx context.Context, tx pgx.Tx, sagaID string, status Status, failureReason *string) error {
	_, err := tx.Exec(ctx, `
		UPDATE saga_states
		SET status = $2, failure_reason = COALESCE($3, failure_reason), updated_at = now()
		WHERE saga_id = $1
	`, sagaID, status, failureReason)
	if err != nil {
		return fmt.Errorf("failed to transition saga status: %w", err)
	}
	return nil
}

// ScheduleCompensationRetry marks a saga as FAILED after a failed compensation attempt and
// delays re-eligibility until updated_at to avoid hot retry loops.
func (s *Store) ScheduleCompensationRetry(ctx context.Context, tx pgx.Tx, sagaID string, failureReason string, delay time.Duration) error {
	if delay < time.Second {
		delay = time.Second
	}
	ms := delay.Milliseconds()
	_, err := tx.Exec(ctx, `
		UPDATE saga_states
		SET status = $2,
		    failure_reason = $3,
		    updated_at = now() + ($4 * interval '1 millisecond')
		WHERE saga_id = $1
	`, sagaID, StatusFailed, failureReason, ms)
	if err != nil {
		return fmt.Errorf("failed to schedule compensation retry: %w", err)
	}
	return nil
}

// ClaimSagasForCompensation safely locks failed or stalled sagas for compensation processing.
func (s *Store) ClaimSagasForCompensation(ctx context.Context, limit int, maxAttempts int, stalledTimeout time.Duration) ([]SagaState, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("claim sagas begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		WITH candidate AS (
			SELECT saga_id
			FROM saga_states
			WHERE retry_count < $2
			  AND (
				(status = 'FAILED' AND updated_at <= now())
				OR (status = 'COMPENSATING' AND updated_at < now() - $3::interval)
			  )
			ORDER BY updated_at ASC
			LIMIT $1
			FOR UPDATE SKIP LOCKED
		)
		UPDATE saga_states s
		SET status = 'COMPENSATING',
		    retry_count = s.retry_count + 1,
		    updated_at = now()
		FROM candidate c
		WHERE s.saga_id = c.saga_id
		RETURNING s.saga_id, s.correlation_id, s.causation_id, s.status, s.current_step, s.updated_at, s.timeout_at, s.failure_reason, s.retry_count
	`, limit, maxAttempts, fmt.Sprintf("%d seconds", int(stalledTimeout.Seconds())))

	if err != nil {
		return nil, fmt.Errorf("claim sagas query: %w", err)
	}
	defer rows.Close()

	var sagas []SagaState
	for rows.Next() {
		var state SagaState
		var timeout *time.Time
		if err := rows.Scan(
			&state.ID, &state.CorrelationID, &state.CausationID,
			&state.CurrentStatus, &state.CurrentStep,
			&state.UpdatedAt, &timeout,
			&state.FailureReason, &state.RetryCount,
		); err != nil {
			return nil, fmt.Errorf("claim sagas scan: %w", err)
		}
		if timeout != nil {
			state.TimeoutAt = *timeout
		}
		state.CreatedAt = state.UpdatedAt
		sagas = append(sagas, state)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("claim sagas rows err: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("claim sagas commit: %w", err)
	}

	return sagas, nil
}

// EscalateToDLQ marks a saga as DEAD_LETTER when compensation attempts are exhausted.
func (s *Store) EscalateToDLQ(ctx context.Context, sagaID string, reason string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE saga_states
		SET status = 'DEAD_LETTER',
		    failure_reason = CASE
		        WHEN failure_reason IS NULL OR failure_reason = '' THEN $2
		        ELSE failure_reason || '; DLQ: ' || $2
		    END,
		    updated_at = now()
		WHERE saga_id = $1
	`, sagaID, reason)
	if err != nil {
		return fmt.Errorf("escalate saga to DLQ: %w", err)
	}
	return nil
}
