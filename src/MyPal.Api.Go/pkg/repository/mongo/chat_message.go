package mongo

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ChatMessage represents a single persisted message in a chat session/history.
type ChatMessage struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id,omitempty"`
	UserID    string             `bson:"user_id" json:"user_id"`
	SessionID string             `bson:"session_id,omitempty" json:"session_id,omitempty"`
	Role      string             `bson:"role" json:"role"` // e.g. "user" | "assistant" | "system"
	Content   string             `bson:"content" json:"content"`
	CreatedAt time.Time          `bson:"created_at" json:"created_at"`
}
