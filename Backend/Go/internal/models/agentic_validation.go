package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// AgenticValidationLog is persisted to MongoDB for agentic product validation runs
// (Gemini reasoning trace, timing, scrape payloads).
type AgenticValidationLog struct {
	ID                primitive.ObjectID `bson:"_id,omitempty"             json:"id,omitempty"`
	ProductID         string             `bson:"product_id"                  json:"product_id"`
	GeminiReasoning   string             `bson:"gemini_reasoning_process"    json:"gemini_reasoning_process"`
	ValidationAttempt time.Time          `bson:"validation_attempt"          json:"validation_attempt"`
	FullMetadata      map[string]any     `bson:"full_metadata"               json:"full_metadata,omitempty"`
}
