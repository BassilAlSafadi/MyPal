package main

import (
	"context"
	"fmt"
	"mypal/api/go/internal/models"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
)

func seedMongo(db *mongo.Database) {
	coll := db.Collection("negotiation_sessions")

	sessions := []interface{}{
		models.NegotiationSession{
			TicketID: "TKT-1001", // Matches a Postgres UUID later
			Status:   "open",
			Messages: []models.Message{
				{Role: "buyer", Content: "Hey, can I see more photos of the GPU?", Timestamp: time.Now()},
				{Role: "seller", Content: "Sure, check the MyPal product media gallery.", Timestamp: time.Now().Add(time.Minute * 2)},
			},
			UpdatedAt: time.Now(),
		},
		// ... loop this 100 times with variations
	}
	coll.InsertMany(context.TODO(), sessions)
}
func main() {
	fmt.Println("MyPal Support Go Service Starting...")
}
