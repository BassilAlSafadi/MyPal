package models

import "time"

// AlgorithmSteering represents a row in the public.user_algorithm_steering table.
//
// Each row is unique on (user_id, factor_key). The repository uses
// INSERT … ON CONFLICT DO UPDATE so callers can treat this as an upsert —
// they do not need to distinguish between a first-time write and an update.
//
// Weight semantics:
//
//	weight_multiplier is a float in the range [0.0, ∞). A value of 1.0 means
//	"use the default model weight". Values > 1 amplify the factor; values < 1
//	suppress it. The AI inference layer reads these per-user multipliers before
//	scoring candidates.
type AlgorithmSteering struct {
	ID               string     `db:"id"                json:"id"`
	UserID           string     `db:"user_id"           json:"user_id"`
	FactorKey        string     `db:"factor_key"        json:"factor_key"`
	WeightMultiplier float64    `db:"weight_multiplier" json:"weight_multiplier"`
	UpdatedAt        *time.Time `db:"updated_at"        json:"updated_at"`
}
