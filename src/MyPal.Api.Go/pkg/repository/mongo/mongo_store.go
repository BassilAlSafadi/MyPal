package mongo

import (
	"context"
	"time"

	driver "go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MongoStore struct {
	Client   *driver.Client
	Database *driver.Database
}

func NewMongoStore(ctx context.Context, uri string, databaseName string) (*MongoStore, error) {
	client, err := driver.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}

	// Validate connectivity early.
	pingCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	if err := client.Ping(pingCtx, nil); err != nil {
		_ = client.Disconnect(ctx)
		return nil, err
	}

	db := client.Database(databaseName)
	return &MongoStore{Client: client, Database: db}, nil
}

func (s *MongoStore) Close(ctx context.Context) error {
	if s == nil || s.Client == nil {
		return nil
	}
	return s.Client.Disconnect(ctx)
}
