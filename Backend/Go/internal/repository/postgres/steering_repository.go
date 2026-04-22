package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"mypal/api/go/internal/models"
	"mypal/api/go/internal/repository"
)

// Compile-time assertion: steeringRepository must satisfy repository.SteeringRepository.
var _ repository.SteeringRepository = (*steeringRepository)(nil)

type steeringRepository struct {
	db *pgxpool.Pool
}

// NewSteeringRepository constructs a Postgres-backed SteeringRepository.
func NewSteeringRepository(db *pgxpool.Pool) repository.SteeringRepository {
	return &steeringRepository{db: db}
}

// -----------------------------------------------------------------------------
// UpsertSteering
// -----------------------------------------------------------------------------

const upsertSteeringSQL = `
INSERT INTO public.user_algorithm_steering (
    id,
    user_id,
    factor_key,
    weight_multiplier,
    updated_at
) VALUES (
    $1, $2, $3, $4, now()
)
ON CONFLICT (user_id, factor_key)
DO UPDATE SET
    weight_multiplier = EXCLUDED.weight_multiplier,
    updated_at        = now()`

// UpsertSteering inserts a new weight-multiplier row or updates the existing
// one if (user_id, factor_key) already exists. Callers do not need to check
// whether a row exists before calling this method.
func (r *steeringRepository) UpsertSteering(ctx context.Context, steering *models.AlgorithmSteering) error {
	_, err := r.db.Exec(ctx, upsertSteeringSQL,
		steering.ID,
		steering.UserID,
		steering.FactorKey,
		steering.WeightMultiplier,
	)
	if err != nil {
		return fmt.Errorf("steeringRepository.UpsertSteering: exec: %w", err)
	}
	return nil
}

// -----------------------------------------------------------------------------
// GetSteeringByUserID
// -----------------------------------------------------------------------------

const getSteeringByUserIDSQL = `
SELECT
    id,
    user_id,
    factor_key,
    weight_multiplier,
    updated_at
FROM public.user_algorithm_steering
WHERE user_id = $1
ORDER BY factor_key ASC`

// GetSteeringByUserID returns all weight-multiplier rows for a user.
// Returns an empty (non-nil) slice when no rows exist — the AI layer should
// treat an empty result as "all factors at their default weight of 1.0".
func (r *steeringRepository) GetSteeringByUserID(ctx context.Context, userID string) ([]*models.AlgorithmSteering, error) {
	rows, err := r.db.Query(ctx, getSteeringByUserIDSQL, userID)
	if err != nil {
		return nil, fmt.Errorf("steeringRepository.GetSteeringByUserID: query: %w", err)
	}
	defer rows.Close()

	results := make([]*models.AlgorithmSteering, 0)
	for rows.Next() {
		s := &models.AlgorithmSteering{}
		if err := rows.Scan(
			&s.ID,
			&s.UserID,
			&s.FactorKey,
			&s.WeightMultiplier,
			&s.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("steeringRepository.GetSteeringByUserID: scan: %w", err)
		}
		results = append(results, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("steeringRepository.GetSteeringByUserID: rows: %w", err)
	}
	return results, nil
}

// -----------------------------------------------------------------------------
// DeleteSteering
// -----------------------------------------------------------------------------

const deleteSteeringSQL = `
DELETE FROM public.user_algorithm_steering
WHERE user_id   = $1
  AND factor_key = $2`

// DeleteSteering removes a specific (user_id, factor_key) row.
// After deletion the AI layer will use the model-default weight of 1.0 for
// that factor on the next inference run.
// Deleting a non-existent row is not an error.
func (r *steeringRepository) DeleteSteering(ctx context.Context, userID string, factorKey string) error {
	_, err := r.db.Exec(ctx, deleteSteeringSQL, userID, factorKey)
	if err != nil {
		return fmt.Errorf("steeringRepository.DeleteSteering: exec: %w", err)
	}
	return nil
}
