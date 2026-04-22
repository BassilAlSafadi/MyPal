package postgres

import (
	"context"

	"mypal/api/go/internal/models"
	"mypal/api/go/internal/repository"
)

// Compile-time check: orderRepository must satisfy repository.OrderRepository.
var _ repository.OrderRepository = (*orderRepository)(nil)

type orderRepository struct {
	// postgres db connection reference (e.g. *pgxpool.Pool or *sql.DB)
}

// NewOrderRepository constructs a Postgres-backed OrderRepository.
func NewOrderRepository() repository.OrderRepository {
	return &orderRepository{}
}

// CreateOrder inserts a new order into the public.orders table.
// The order's destination_* fields must already be populated via
// order.SnapshotUserLocation(user) before this method is called.
func (r *orderRepository) CreateOrder(ctx context.Context, order *models.Order) error {
	return nil
}

// GetOrderByID retrieves a single order by its UUID primary key.
func (r *orderRepository) GetOrderByID(ctx context.Context, id string) (*models.Order, error) {
	return nil, nil
}

// GetOrdersByUserID retrieves all orders for a given user, newest first.
func (r *orderRepository) GetOrdersByUserID(ctx context.Context, userID string) ([]*models.Order, error) {
	return nil, nil
}

// UpdateOrderStatus transitions an order to a new status string.
func (r *orderRepository) UpdateOrderStatus(ctx context.Context, id string, status string) error {
	return nil
}
