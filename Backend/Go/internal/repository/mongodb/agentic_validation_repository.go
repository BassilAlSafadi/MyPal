package mongodb

import (
	"context"
	"fmt"

	"mypal/api/go/internal/models"

	"go.mongodb.org/mongo-driver/mongo"
)

const AgenticValidationLogsCollection = "agentic_validation_logs"

// InsertAgenticValidationLog writes one validation run document to MongoDB.
// When log.ID is zero, the server assigns an ObjectID.
func InsertAgenticValidationLog(ctx context.Context, db *mongo.Database, log *models.AgenticValidationLog) error {
	if db == nil || log == nil {
		return fmt.Errorf("InsertAgenticValidationLog: nil db or log")
	}
	_, err := db.Collection(AgenticValidationLogsCollection).InsertOne(ctx, log)
	if err != nil {
		return fmt.Errorf("InsertAgenticValidationLog: %w", err)
	}
	return nil
}
