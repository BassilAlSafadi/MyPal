package models

import "time"

// LifeTrackHistory maps to public.life_track_history — append-only narrative transitions.
type LifeTrackHistory struct {
	ID               string     `db:"id"                 json:"id"`
	UserID           *string    `db:"user_id"            json:"user_id,omitempty"`
	PreviousStory    *string    `db:"previous_story"     json:"previous_story,omitempty"`
	EventTriggerType *string    `db:"event_trigger_type" json:"event_trigger_type,omitempty"`
	CreatedAt        *time.Time `db:"created_at"         json:"created_at,omitempty"`
}
