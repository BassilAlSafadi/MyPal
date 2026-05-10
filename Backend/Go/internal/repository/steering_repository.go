package repository

import (
	"context"

	"mypal/api/go/internal/models"
)

// SteeringRepository defines the contract for reading and upserting per-user
// algorithm weight multipliers in the public.user_algorithm_steering table.
//
// All writes are upserts: the underlying SQL uses ON CONFLICT (user_id, sector_name)
// DO UPDATE, so the caller never has to check whether a row already exists.
type SteeringRepository interface {
	// UpsertSteering inserts or updates a single weight-multiplier row for a
	// given (user_id, sector_name) pair.
	UpsertSteering(ctx context.Context, steering *models.AlgorithmSteering) error

	// GetSteeringByUserID returns all weight-multiplier rows for a user.
	// Returns an empty slice (not an error) when no rows exist yet.
	GetSteeringByUserID(ctx context.Context, userID string) ([]*models.AlgorithmSteering, error)

	// DeleteSteering removes a specific (user_id, sector_name) row.
	DeleteSteering(ctx context.Context, userID string, sectorName string) error
}
