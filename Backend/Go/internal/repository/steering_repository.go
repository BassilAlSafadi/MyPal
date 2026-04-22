package repository

import (
	"context"

	"mypal/api/go/internal/models"
)

// SteeringRepository defines the contract for reading and upserting per-user
// algorithm weight multipliers in the public.user_algorithm_steering table.
//
// All writes are upserts: the underlying SQL uses ON CONFLICT (user_id, factor_key)
// DO UPDATE, so the caller never has to check whether a row already exists.
type SteeringRepository interface {
	// UpsertSteering inserts or updates a single weight-multiplier row for a
	// given (user_id, factor_key) pair.
	UpsertSteering(ctx context.Context, steering *models.AlgorithmSteering) error

	// GetSteeringByUserID returns all weight-multiplier rows for a user.
	// Returns an empty slice (not an error) when no rows exist yet.
	GetSteeringByUserID(ctx context.Context, userID string) ([]*models.AlgorithmSteering, error)

	// DeleteSteering removes a specific (user_id, factor_key) row, effectively
	// resetting that factor to its model default (1.0) on the next inference run.
	DeleteSteering(ctx context.Context, userID string, factorKey string) error
}
