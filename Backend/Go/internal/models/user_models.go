package models

import (
	"time"

	"github.com/pgvector/pgvector-go"
)

// User represents a row in the public.users table.
// Location: GooglePlaceID, Lat, Lng, City, State — snapshotted into Order at checkout.
type User struct {
	ID            string     `db:"id"                json:"id"`
	FirstName     string     `db:"first_name"        json:"first_name"`
	LastName      string     `db:"last_name"         json:"last_name"`
	Email         string     `db:"email"             json:"email"`
	Phone         *string    `db:"phone"             json:"phone"`
	WalletBalance *float64   `db:"wallet_balance"    json:"wallet_balance"`
	CreatedAt     *time.Time `db:"created_at"       json:"created_at"`
	UpdatedAt     *time.Time `db:"updated_at"       json:"updated_at"`
	IsDeleted     *bool      `db:"is_deleted"        json:"is_deleted"`

	GooglePlaceID *string  `db:"google_place_id" json:"google_place_id"`
	Lat           *float64 `db:"lat"             json:"lat"`
	Lng           *float64 `db:"lng"             json:"lng"`
	City          *string  `db:"city"            json:"city,omitempty"`
	State         *string  `db:"state"           json:"state,omitempty"`

	// Narrative Life Track — canonical profile story and embedding vector(768).
	LifeTrackStory *string          `db:"life_track_story" json:"life_track_story,omitempty"`
	StoryEmbedding *pgvector.Vector `db:"story_embedding"  json:"story_embedding,omitempty"`
}
