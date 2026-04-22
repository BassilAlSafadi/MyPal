package repository

import (
	"context"

	"mypal/api/go/internal/models"
)

// OrderRepository defines the contract for persisting and retrieving Order
// records from the Postgres (Supabase) database.
//
// All implementations must live in internal/repository/postgres/ and be
// constructed via a New* factory function that accepts a db connection handle.
type OrderRepository interface {
	// CreateOrder inserts a new order row. The caller is responsible for calling
	// order.SnapshotUserLocation(user) before passing the order here, so that
	// all destination_* fields are populated.
	CreateOrder(ctx context.Context, order *models.Order) error

	// GetOrderByID retrieves a single order by its UUID primary key.
	GetOrderByID(ctx context.Context, id string) (*models.Order, error)

	// GetOrdersByUserID retrieves all orders belonging to a user, ordered by
	// created_at descending (most recent first).
	GetOrdersByUserID(ctx context.Context, userID string) ([]*models.Order, error)

	// UpdateOrderStatus transitions an order to a new status value.
	UpdateOrderStatus(ctx context.Context, id string, status string) error
}
