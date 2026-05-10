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

const upsertSteeringSQL = `
INSERT INTO public.user_algorithm_steering (
    user_id,
    sector_name,
    weight_multiplier,
    is_pinned,
    updated_at
) VALUES (
    $1, $2, $3, $4, now()
)
ON CONFLICT (user_id, sector_name)
DO UPDATE SET
    weight_multiplier = EXCLUDED.weight_multiplier,
    is_pinned         = EXCLUDED.is_pinned,
    updated_at        = now()`

// UpsertSteering inserts or updates a row for (user_id, sector_name).
func (r *steeringRepository) UpsertSteering(ctx context.Context, steering *models.AlgorithmSteering) error {
	_, err := r.db.Exec(ctx, upsertSteeringSQL,
		steering.UserID,
		steering.SectorName,
		steering.WeightMultiplier,
		steering.IsPinned,
	)
	if err != nil {
		return fmt.Errorf("steeringRepository.UpsertSteering: exec: %w", err)
	}
	return nil
}

const getSteeringByUserIDSQL = `
SELECT
    user_id,
    sector_name,
    weight_multiplier,
    is_pinned,
    updated_at
FROM public.user_algorithm_steering
WHERE user_id = $1
ORDER BY sector_name ASC`

// GetSteeringByUserID returns all steering rows for a user.
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
			&s.UserID,
			&s.SectorName,
			&s.WeightMultiplier,
			&s.IsPinned,
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

const deleteSteeringSQL = `
DELETE FROM public.user_algorithm_steering
WHERE user_id    = $1
  AND sector_name = $2`

// DeleteSteering removes a (user_id, sector_name) row.
func (r *steeringRepository) DeleteSteering(ctx context.Context, userID string, sectorName string) error {
	_, err := r.db.Exec(ctx, deleteSteeringSQL, userID, sectorName)
	if err != nil {
		return fmt.Errorf("steeringRepository.DeleteSteering: exec: %w", err)
	}
	return nil
}
