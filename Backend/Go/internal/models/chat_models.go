package models

import "time"

type ChatMessage struct {
	ID        string    `bson:"_id,omitempty" json:"id"`
	TicketID  string    `bson:"ticket_id" json:"ticket_id"`
	UserID    string    `bson:"user_id" json:"user_id"`
	Content   string    `bson:"content" json:"content"`
	Timestamp time.Time `bson:"timestamp" json:"timestamp"`
}

type ChatSession struct {
	ID        string    `bson:"_id,omitempty" json:"id"`
	TicketID  string    `bson:"ticket_id" json:"ticket_id"`
	IsActive  bool      `bson:"is_active" json:"is_active"`
	StartedAt time.Time `bson:"started_at" json:"started_at"`
}
