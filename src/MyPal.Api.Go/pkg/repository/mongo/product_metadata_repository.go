package mongo

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	driver "go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type ProductMetadataRepository struct {
	col *driver.Collection
}

func NewProductMetadataRepository(store *MongoStore, collectionName string) *ProductMetadataRepository {
	return &ProductMetadataRepository{col: store.Database.Collection(collectionName)}
}

func (r *ProductMetadataRepository) Upsert(ctx context.Context, meta *ProductMetadata) error {
	now := time.Now().UTC()
	if meta.CreatedAt.IsZero() {
		meta.CreatedAt = now
	}
	meta.UpdatedAt = now

	filter := bson.M{"product_id": meta.ProductID}
	update := bson.M{"$set": meta}
	_, err := r.col.UpdateOne(ctx, filter, update, options.Update().SetUpsert(true))
	return err
}

func (r *ProductMetadataRepository) GetByProductID(ctx context.Context, productID string) (*ProductMetadata, error) {
	var out ProductMetadata
	err := r.col.FindOne(ctx, bson.M{"product_id": productID}).Decode(&out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}
