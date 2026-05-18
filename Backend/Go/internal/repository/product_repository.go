package repository

import (
	"context"

	"mypal/api/go/internal/models"
)

// ProductRepository defines the contract for reading and mutating product rows
// in the public.mypal_products table.
//
// Implementations live in internal/repository/postgres/ and must be
// constructed via NewProductRepository(*pgxpool.Pool).
type ProductRepository interface {
	// GetMyPalProduct retrieves a single product by its UUID primary key.
	// Returns nil, nil when no row is found (pgx.ErrNoRows is absorbed).
	GetMyPalProduct(ctx context.Context, id string) (*models.Product, error)

	// GetProductsBySellerID returns all products listed by a given seller,
	// ordered by created_at descending.
	GetProductsBySellerID(ctx context.Context, sellerID string) ([]*models.Product, error)

	// UpdateAuthenticity sets the authenticity_status field on a product row.
	// authenticityStatus must be one of: "pending", "verified", "flagged".
	UpdateAuthenticity(ctx context.Context, serialNumber string, authenticityStatus string) error
}
