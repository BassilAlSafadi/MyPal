package messaging

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
)

// persistGatewayPoisonEvent inserts a forensic row before a poison NATS message is terminated.
func persistGatewayPoisonEvent(ctx context.Context, db *pgxpool.Pool, consumerName, subject string, payload []byte, headers nats.Header, traceID, correlationID, causationID, reason string, deliveryCount uint64) {
	if db == nil {
		return
	}
	hj, err := json.Marshal(map[string][]string(headers))
	if err != nil {
		hj = []byte("{}")
	}
	insertCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	_, err = db.Exec(insertCtx, `
		INSERT INTO gateway_poison_events (
			id, consumer_name, subject, payload, headers_json,
			trace_id, correlation_id, causation_id, failure_reason, delivery_count, created_at
		) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, now())
	`, uuid.New(), consumerName, subject, payload, string(hj), traceID, correlationID, causationID, reason, deliveryCount)
	if err != nil {
		slog.Error("gateway_poison_events: insert failed", "consumer", consumerName, "subject", subject, "error", err)
	}
}
