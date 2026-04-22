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

// Compile-time assertion: orderRepository must satisfy repository.OrderRepository.
var _ repository.OrderRepository = (*orderRepository)(nil)

type orderRepository struct {
	db *pgxpool.Pool
}

// NewOrderRepository constructs a Postgres-backed OrderRepository.
func NewOrderRepository(db *pgxpool.Pool) repository.OrderRepository {
	return &orderRepository{db: db}
}

// -----------------------------------------------------------------------------
// CreateOrder
// -----------------------------------------------------------------------------

const createOrderSQL = `
INSERT INTO public.orders (
    id,
    user_id,
    status,
    total_amount,
    destination_google_place_id,
    destination_lat,
    destination_lng,
    destination_address,
    created_at,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, now(), now()
)`

// CreateOrder inserts a new order row.
//
// Pre-condition: the caller must have already called order.SnapshotUserLocation(user)
// so that all destination_* fields are populated. If they are nil, the insert
// will still succeed but audit and delivery records will be incomplete.
func (r *orderRepository) CreateOrder(ctx context.Context, order *models.Order) error {
	_, err := r.db.Exec(ctx, createOrderSQL,
		order.ID,
		order.UserID,
		order.Status,
		order.TotalAmount,
		order.DestinationGooglePlaceID,
		order.DestinationLat,
		order.DestinationLng,
		order.DestinationAddress,
	)
	if err != nil {
		return fmt.Errorf("orderRepository.CreateOrder: exec: %w", err)
	}
	return nil
}

// -----------------------------------------------------------------------------
// GetOrderByID
// -----------------------------------------------------------------------------

const getOrderByIDSQL = `
SELECT
    id,
    user_id,
    status,
    total_amount,
    destination_google_place_id,
    destination_lat,
    destination_lng,
    destination_address,
    created_at,
    updated_at
FROM public.orders
WHERE id = $1
LIMIT 1`

// GetOrderByID retrieves a single order by its UUID primary key.
// Returns (nil, nil) when no row is found.
func (r *orderRepository) GetOrderByID(ctx context.Context, id string) (*models.Order, error) {
	row := r.db.QueryRow(ctx, getOrderByIDSQL, id)

	o := &models.Order{}
	err := row.Scan(
		&o.ID,
		&o.UserID,
		&o.Status,
		&o.TotalAmount,
		&o.DestinationGooglePlaceID,
		&o.DestinationLat,
		&o.DestinationLng,
		&o.DestinationAddress,
		&o.CreatedAt,
		&o.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("orderRepository.GetOrderByID: scan: %w", err)
	}
	return o, nil
}

// -----------------------------------------------------------------------------
// GetOrdersByUserID
// -----------------------------------------------------------------------------

const getOrdersByUserIDSQL = `
SELECT
    id,
    user_id,
    status,
    total_amount,
    destination_google_place_id,
    destination_lat,
    destination_lng,
    destination_address,
    created_at,
    updated_at
FROM public.orders
WHERE user_id = $1
ORDER BY created_at DESC`

// GetOrdersByUserID returns all orders for a given user, newest first.
func (r *orderRepository) GetOrdersByUserID(ctx context.Context, userID string) ([]*models.Order, error) {
	rows, err := r.db.Query(ctx, getOrdersByUserIDSQL, userID)
	if err != nil {
		return nil, fmt.Errorf("orderRepository.GetOrdersByUserID: query: %w", err)
	}
	defer rows.Close()

	var orders []*models.Order
	for rows.Next() {
		o := &models.Order{}
		if err := rows.Scan(
			&o.ID,
			&o.UserID,
			&o.Status,
			&o.TotalAmount,
			&o.DestinationGooglePlaceID,
			&o.DestinationLat,
			&o.DestinationLng,
			&o.DestinationAddress,
			&o.CreatedAt,
			&o.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("orderRepository.GetOrdersByUserID: scan: %w", err)
		}
		orders = append(orders, o)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("orderRepository.GetOrdersByUserID: rows: %w", err)
	}
	return orders, nil
}

// -----------------------------------------------------------------------------
// UpdateOrderStatus
// -----------------------------------------------------------------------------

const updateOrderStatusSQL = `
UPDATE public.orders
SET
    status     = $1,
    updated_at = now()
WHERE id = $2`

// UpdateOrderStatus transitions an order to a new status value.
func (r *orderRepository) UpdateOrderStatus(ctx context.Context, id string, status string) error {
	_, err := r.db.Exec(ctx, updateOrderStatusSQL, status, id)
	if err != nil {
		return fmt.Errorf("orderRepository.UpdateOrderStatus: exec: %w", err)
	}
	return nil
}
