package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type NegotiationSession struct {
	ID        primitive.ObjectID `bson:"_id,omitempty"`
	TicketID  string             `bson:"ticket_id"` // Links to Postgres UUID
	Status    string             `bson:"status"`    // "open", "settled"
	Messages  []Message          `bson:"messages"`
	UpdatedAt time.Time          `bson:"updated_at"`
}

type Message struct {
	Role      string    `bson:"role"` // "buyer", "seller", "ai_broker"
	Content   string    `bson:"content"`
	Timestamp time.Time `bson:"timestamp"`
}
