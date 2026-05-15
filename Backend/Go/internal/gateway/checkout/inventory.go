package checkout

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"
)

// ReservationItem represents a single product reservation request.
type ReservationItem struct {
	ProductID string
	Quantity  int
}

// ReserveInventory attempts to lock and reserve inventory for the given items.
// Uses FOR UPDATE SKIP LOCKED to prevent overselling and blocking.
func ReserveInventory(ctx context.Context, tx pgx.Tx, items []ReservationItem, traceID string) error {
	slog.Info("checkout: reserving inventory", "trace_id", traceID, "item_count", len(items))

	for _, item := range items {
		var currentStock int
		
		// 1. Lock the row for update, skip if already locked (optimistic concurrency)
		err := tx.QueryRow(ctx, `
			SELECT stock_qty 
			FROM products 
			WHERE id = $1 AND is_deleted IS NOT TRUE
			FOR UPDATE SKIP LOCKED
		`, item.ProductID).Scan(&currentStock)

		if err != nil {
			if err == pgx.ErrNoRows {
				slog.Warn("checkout: product locked or unavailable", "trace_id", traceID, "product_id", item.ProductID)
				return fmt.Errorf("product %s is unavailable or currently locked by another transaction", item.ProductID)
			}
			return fmt.Errorf("failed to check stock for product %s: %w", item.ProductID, err)
		}

		// 2. Validate stock
		if currentStock < item.Quantity {
			slog.Warn("checkout: insufficient stock", "trace_id", traceID, "product_id", item.ProductID, "requested", item.Quantity, "available", currentStock)
			return fmt.Errorf("insufficient stock for product %s", item.ProductID)
		}

		// 3. Deduct stock
		_, err = tx.Exec(ctx, `
			UPDATE products 
			SET stock_qty = stock_qty - $2, updated_at = now() 
			WHERE id = $1
		`, item.ProductID, item.Quantity)
		
		if err != nil {
			return fmt.Errorf("failed to deduct stock for product %s: %w", item.ProductID, err)
		}
	}

	return nil
}
