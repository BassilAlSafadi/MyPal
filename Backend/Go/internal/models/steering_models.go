package models

import "time"

// AlgorithmSteering represents a row in public.user_algorithm_steering.
// Primary key is (user_id, sector_name); there is no surrogate id column.
//
// Writes use INSERT … ON CONFLICT DO UPDATE — callers can treat this as an upsert.
//
// Weight semantics:
//
//	weight_multiplier is a float in the range [0.0, ∞). A value of 1.0 means
//	"use the default model weight". Values > 1 amplify the sector; values < 1
//	suppress it.
type AlgorithmSteering struct {
	UserID           string     `db:"user_id"           json:"user_id"`
	SectorName       string     `db:"sector_name"       json:"sector_name"`
	WeightMultiplier float64    `db:"weight_multiplier" json:"weight_multiplier"`
	IsPinned         bool       `db:"is_pinned"         json:"is_pinned"`
	UpdatedAt        *time.Time `db:"updated_at"        json:"updated_at"`
}
