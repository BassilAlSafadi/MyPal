package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"mypal/api/go/internal/models"
	"mypal/api/go/internal/repository"
)

// Compile-time assertion: productRepository must satisfy repository.ProductRepository.
var _ repository.ProductRepository = (*productRepository)(nil)

type productRepository struct {
	db *pgxpool.Pool
}

// NewProductRepository constructs a Postgres-backed ProductRepository.
// db must be a live, connected pool; the constructor does not acquire a
// connection itself.
func NewProductRepository(db *pgxpool.Pool) repository.ProductRepository {
	return &productRepository{db: db}
}

// -----------------------------------------------------------------------------
// GetMyPalProduct
// -----------------------------------------------------------------------------

const getMyPalProductSQL = `
SELECT
    id,
    seller_id,
    name,
    description,
    price,
    category,
    image_url,
    stock_quantity,
    serial_number,
    authenticity_status,
    created_at,
    updated_at
FROM public.mypal_products
WHERE id = $1
LIMIT 1`

// GetMyPalProduct retrieves a product by its UUID primary key.
// Returns (nil, nil) when the product does not exist.
func (r *productRepository) GetMyPalProduct(ctx context.Context, id string) (*models.Product, error) {
	row := r.db.QueryRow(ctx, getMyPalProductSQL, id)

	p := &models.Product{}
	err := row.Scan(
		&p.ID,
		&p.SellerID,
		&p.Name,
		&p.Description,
		&p.Price,
		&p.Category,
		&p.ImageURL,
		&p.StockQuantity,
		&p.SerialNumber,
		&p.AuthenticityStatus,
		&p.CreatedAt,
		&p.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("productRepository.GetMyPalProduct: scan: %w", err)
	}
	return p, nil
}

// -----------------------------------------------------------------------------
// GetProductsBySellerID
// -----------------------------------------------------------------------------

const getProductsBySellerIDSQL = `
SELECT
    id,
    seller_id,
    name,
    description,
    price,
    category,
    image_url,
    stock_quantity,
    serial_number,
    authenticity_status,
    created_at,
    updated_at
FROM public.mypal_products
WHERE seller_id = $1
ORDER BY created_at DESC`

// GetProductsBySellerID returns all products listed by a given seller.
func (r *productRepository) GetProductsBySellerID(ctx context.Context, sellerID string) ([]*models.Product, error) {
	rows, err := r.db.Query(ctx, getProductsBySellerIDSQL, sellerID)
	if err != nil {
		return nil, fmt.Errorf("productRepository.GetProductsBySellerID: query: %w", err)
	}
	defer rows.Close()

	var products []*models.Product
	for rows.Next() {
		p := &models.Product{}
		if err := rows.Scan(
			&p.ID,
			&p.SellerID,
			&p.Name,
			&p.Description,
			&p.Price,
			&p.Category,
			&p.ImageURL,
			&p.StockQuantity,
			&p.SerialNumber,
			&p.AuthenticityStatus,
			&p.CreatedAt,
			&p.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("productRepository.GetProductsBySellerID: scan: %w", err)
		}
		products = append(products, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("productRepository.GetProductsBySellerID: rows: %w", err)
	}
	return products, nil
}

// -----------------------------------------------------------------------------
// UpdateAuthenticity
// -----------------------------------------------------------------------------

const updateAuthenticitySQL = `
UPDATE public.mypal_products
SET
    authenticity_status = $1,
    updated_at          = now()
WHERE serial_number = $2`

// UpdateAuthenticity sets authenticity_status for the product identified by its
// physical serial_number. Valid values: "pending", "verified", "flagged".
func (r *productRepository) UpdateAuthenticity(ctx context.Context, serialNumber string, authenticityStatus string) error {
	_, err := r.db.Exec(ctx, updateAuthenticitySQL, authenticityStatus, serialNumber)
	if err != nil {
		return fmt.Errorf("productRepository.UpdateAuthenticity: exec: %w", err)
	}
	return nil
}
