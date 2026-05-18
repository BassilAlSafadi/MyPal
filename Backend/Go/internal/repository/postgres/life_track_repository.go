package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/pgvector/pgvector-go"
)

// StoryEmbeddingDimensions matches public.users.story_embedding vector(768).
const StoryEmbeddingDimensions = 768

const updateUserLifeTrackSQL = `
UPDATE public.users
SET life_track_story = $2,
    story_embedding = $3,
    updated_at = now()
WHERE id = $1::uuid`

// UpdateUserLifeTrack persists the canonical narrative text and embedding for a user.
// emb must be exactly StoryEmbeddingDimensions elements (vector(768)).
func UpdateUserLifeTrack(ctx context.Context, tx pgx.Tx, userID string, story string, emb pgvector.Vector) error {
	if len(emb.Slice()) != StoryEmbeddingDimensions {
		return fmt.Errorf("story embedding must have %d dimensions, got %d", StoryEmbeddingDimensions, len(emb.Slice()))
	}
	ct, err := tx.Exec(ctx, updateUserLifeTrackSQL, userID, story, emb)
	if err != nil {
		return fmt.Errorf("UpdateUserLifeTrack: exec: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return fmt.Errorf("UpdateUserLifeTrack: no user row for id %s", userID)
	}
	return nil
}
