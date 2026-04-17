package mongo

import (
	"context"
	"time"

	driver "go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type ChatRepository struct {
	col *driver.Collection
}

func NewChatRepository(store *MongoStore, collectionName string) *ChatRepository {
	return &ChatRepository{col: store.Database.Collection(collectionName)}
}

func (r *ChatRepository) InsertMessage(ctx context.Context, msg *ChatMessage) error {
	if msg.CreatedAt.IsZero() {
		msg.CreatedAt = time.Now().UTC()
	}
	_, err := r.col.InsertOne(ctx, msg)
	return err
}

func (r *ChatRepository) ListMessagesBySession(ctx context.Context, userID string, sessionID string, limit int64) ([]ChatMessage, error) {
	if limit <= 0 {
		limit = 100
	}

	filter := map[string]any{"user_id": userID, "session_id": sessionID}
	cur, err := r.col.Find(
		ctx,
		filter,
		options.Find().
			SetSort(map[string]any{"created_at": 1}).
			SetLimit(limit),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var out []ChatMessage
	for cur.Next(ctx) {
		var m ChatMessage
		if err := cur.Decode(&m); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, cur.Err()
}
