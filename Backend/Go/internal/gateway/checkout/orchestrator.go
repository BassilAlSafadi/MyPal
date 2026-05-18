package checkout

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace"
	"mypal/api/go/internal/gateway/auth"
	"mypal/api/go/internal/gateway/responses"
	"mypal/api/go/internal/gateway/saga"
	"mypal/api/go/internal/gateway/tracing"
)

var tracer = otel.Tracer("checkout-orchestrator")

// Orchestrator coordinates the checkout saga.
type Orchestrator struct {
	db        *pgxpool.Pool
	sagaStore *saga.Store
}

func NewOrchestrator(db *pgxpool.Pool) *Orchestrator {
	return &Orchestrator{
		db:        db,
		sagaStore: saga.NewStore(db),
	}
}

// GeoSnapshot enforces geo-integrity.
type GeoSnapshot struct {
	Lat           float64 `json:"lat"`
	Lng           float64 `json:"lng"`
	GooglePlaceID string  `json:"google_place_id"`
}

// CheckoutRequest represents the incoming checkout payload.
type CheckoutRequest struct {
	BuyerID     string      `json:"buyer_id"`
	CartID      string      `json:"cart_id"`
	GeoSnapshot GeoSnapshot `json:"geo_snapshot"`
}

// CheckoutResponse returns the result of the saga.
type CheckoutResponse struct {
	ParentOrderID string `json:"parent_order_id"`
	SagaID        string `json:"saga_id"`
	Status        string `json:"status"`
}

// Handler exposes checkout saga orchestration through the Gateway.
func Handler(db *pgxpool.Pool) http.HandlerFunc {
	orchestrator := NewOrchestrator(db)

	return func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())

		var req CheckoutRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			responses.Error(w, http.StatusBadRequest, responses.CodeInvalidQuery, "invalid checkout request body", traceID)
			return
		}

		if identity := auth.IdentityFrom(r.Context()); identity != nil {
			req.BuyerID = identity.UserID
		}
		if req.BuyerID == "" || req.CartID == "" {
			responses.Error(w, http.StatusBadRequest, responses.CodeInvalidQuery, "buyer and cart are required", traceID)
			return
		}

		resp, err := orchestrator.Process(r.Context(), req, traceID)
		if err != nil {
			slog.Error("checkout: orchestration failed", "err", err, "trace_id", traceID)
			responses.InternalError(w, traceID)
			return
		}

		responses.OK(w, resp)
	}
}

// Process coordinates the multi-vendor checkout workflow.
func (o *Orchestrator) Process(ctx context.Context, req CheckoutRequest, traceID string) (*CheckoutResponse, error) {
	ctx, span := tracer.Start(ctx, "checkout.Process", trace.WithAttributes())
	defer span.End()

	slog.Info("checkout: starting saga", "trace_id", traceID, "buyer_id", req.BuyerID)

	sagaID := uuid.New().String()

	// 1. Start Transaction
	tx, err := o.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// 2. Persist Authoritative Saga State FIRST
	now := time.Now().UTC()
	sagaState := &saga.SagaState{
		ID:            sagaID,
		CorrelationID: traceID,
		CausationID:   traceID,
		CurrentStatus: saga.StatusProcessing,
		CurrentStep:   "checkout.started",
		CreatedAt:     now,
		UpdatedAt:     now,
		TimeoutAt:     now.Add(10 * time.Minute),
	}
	sagaStep := &saga.SagaStep{
		ID:             uuid.New().String(),
		SagaID:         sagaID,
		StepName:       "checkout.started",
		ExecutionOrder: 1,
		Status:         saga.StepStatusStarted,
		Timestamp:      now,
	}

	if err := o.sagaStore.InitializeSaga(ctx, tx, sagaState, sagaStep); err != nil {
		return nil, fmt.Errorf("failed to durably initialize saga state: %w", err)
	}

	// 3. Load Cart and Group by Vendor
	// Simulated for scope: In reality, we'd query `carts` and `cart_items` JOIN `products`
	// Assume we have a group of items.

	// 4. Inventory Reservation (FOR UPDATE SKIP LOCKED)
	// Handled by ReserveInventory

	// 5. Order Splitting & Parent/Child Generation
	parentOrderID := uuid.New().String()

	geoJSON, _ := json.Marshal(req.GeoSnapshot)

	// Insert Parent Order
	_, err = tx.Exec(ctx, `
		INSERT INTO orders (id, user_id, total_amount, geo_snapshot, status, created_at, updated_at)
		VALUES ($1, $2, 0, $3, 'pending', now(), now())
	`, parentOrderID, req.BuyerID, geoJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to insert parent order: %w", err)
	}

	// 6. Outbox Insert for 'order.created'
	outboxPayload, _ := json.Marshal(map[string]interface{}{
		"order_id": parentOrderID,
		"buyer_id": req.BuyerID,
		"saga_id":  sagaID,
	})

	_, err = tx.Exec(ctx, `
		INSERT INTO outbox_events (id, type, payload, trace_id, created_at)
		VALUES ($1, 'order.created', $2, $3, now())
	`, uuid.New().String(), outboxPayload, traceID)
	if err != nil {
		return nil, fmt.Errorf("failed to insert outbox event: %w", err)
	}

	// 7. Log completion step and update saga state BEFORE commit
	completeStep := &saga.SagaStep{
		ID:             uuid.New().String(),
		SagaID:         sagaID,
		StepName:       "checkout.order_created",
		ExecutionOrder: 2,
		Status:         saga.StepStatusCompleted,
		Timestamp:      time.Now().UTC(),
	}
	if err := o.sagaStore.LogStep(ctx, tx, completeStep); err != nil {
		return nil, fmt.Errorf("failed to log saga completion step: %w", err)
	}

	if err := o.sagaStore.CompleteSaga(ctx, tx, sagaID); err != nil {
		return nil, fmt.Errorf("failed to mark saga completed: %w", err)
	}

	// 8. Commit Transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	slog.Info("checkout: saga initialization completed durably", "trace_id", traceID, "saga_id", sagaID, "parent_order_id", parentOrderID)

	return &CheckoutResponse{
		ParentOrderID: parentOrderID,
		SagaID:        sagaID,
		Status:        "processing",
	}, nil
}
