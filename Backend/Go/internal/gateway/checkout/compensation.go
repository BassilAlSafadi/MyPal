package checkout

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
)

// CompensationEngine executes rollback logic for failed sagas.
type CompensationEngine struct {
	db *pgxpool.Pool
}

func NewCompensationEngine(db *pgxpool.Pool) *CompensationEngine {
	return &CompensationEngine{db: db}
}

// CompensateInventoryRelease reverses an inventory reservation safely and idempotently.
func (c *CompensationEngine) CompensateInventoryRelease(ctx context.Context, sagaID, productID string, quantity int) error {
	slog.Info("compensation: releasing inventory", "saga_id", sagaID, "product_id", productID)

	// Since we are incrementing stock, it's naturally idempotent if tied to the saga state transition,
	// but strictly speaking, we should record the compensation event to prevent double-increment.

	tx, err := c.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Idempotency check: has this compensation already run?
	var alreadyRun bool
	err = tx.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM processed_events WHERE event_id = $1 AND consumer = 'compensation.inventory'
		)
	`, sagaID).Scan(&alreadyRun)
	if err != nil {
		return err
	}
	if alreadyRun {
		slog.Info("compensation: already executed", "saga_id", sagaID)
		return nil
	}

	// Release stock
	_, err = tx.Exec(ctx, `
		UPDATE products 
		SET stock_qty = stock_qty + $2, updated_at = now() 
		WHERE id = $1
	`, productID, quantity)
	if err != nil {
		return fmt.Errorf("failed to restore stock: %w", err)
	}

	// Mark compensation as processed
	_, err = tx.Exec(ctx, `
		INSERT INTO processed_events (event_id, consumer, processed_at)
		VALUES ($1, 'compensation.inventory', now())
	`, sagaID)
	if err != nil {
		return fmt.Errorf("failed to mark compensation processed: %w", err)
	}

	return tx.Commit(ctx)
}

// CancelOrder sets an order to 'cancelled' status.
func (c *CompensationEngine) CancelOrder(ctx context.Context, orderID string) error {
	slog.Info("compensation: cancelling order", "order_id", orderID)

	_, err := c.db.Exec(ctx, `
		UPDATE orders 
		SET status = 'cancelled', updated_at = now() 
		WHERE id = $1 AND status != 'cancelled'
	`, orderID)
	
	if err != nil {
		return fmt.Errorf("failed to cancel order: %w", err)
	}
	return nil
}
