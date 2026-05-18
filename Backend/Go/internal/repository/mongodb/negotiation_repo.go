package mongodb

import (
	"context"
	"time"

	"mypal/api/go/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

func AddAiBrokerMessage(db *mongo.Database, ticketID string, content string) error {
	collection := db.Collection("dispute_negotiations")
	filter := bson.M{"ticket_id": ticketID}

	update := bson.M{
		"$push": bson.M{"messages": models.Message{
			Role:      "ai_broker",
			Content:   content,
			Timestamp: time.Now(),
		}},
		"$set": bson.M{"updated_at": time.Now()},
	}

	_, err := collection.UpdateOne(context.TODO(), filter, update)
	return err
}
