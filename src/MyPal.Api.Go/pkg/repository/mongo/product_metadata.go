package mongo

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ProductMetadata stores scraped/aggregated JSON product data for fast retrieval.
// Field names mirror proto/catalog.proto where applicable.
type ProductMetadata struct {
	ID primitive.ObjectID `bson:"_id,omitempty" json:"id,omitempty"`

	ProductID string `bson:"product_id" json:"product_id"`
	VendorID  string `bson:"vendor_id,omitempty" json:"vendor_id,omitempty"`

	Name         string  `bson:"name,omitempty" json:"name,omitempty"`
	Category     string  `bson:"category,omitempty" json:"category,omitempty"`
	ProductType  int32   `bson:"product_type,omitempty" json:"product_type,omitempty"`
	CurrentPrice float64 `bson:"current_price,omitempty" json:"current_price,omitempty"`
	StockQty     int32   `bson:"stock_qty,omitempty" json:"stock_qty,omitempty"`

	RawJSON primitive.M `bson:"raw_json,omitempty" json:"raw_json,omitempty"`

	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}
