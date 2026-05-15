package messaging

import (
	"context"
	"testing"

	"github.com/nats-io/nats.go"
	"mypal/api/go/internal/gateway/testutil"
)

func TestUAT_PoisonEventPersistedBeforeTerminationPath(t *testing.T) {
	pool := testutil.UATPool(t)
	ctx := context.Background()

	payload := []byte(`{"bad":true}`)
	headers := nats.Header{
		HeaderTraceID:       []string{"trace-poison-1"},
		HeaderCorrelationID: []string{"corr-poison-1"},
		HeaderCausationID:   []string{"cause-poison-1"},
	}

	persistGatewayPoisonEvent(ctx, pool, "uat-consumer", "order.created", payload, headers,
		"trace-poison-1", "corr-poison-1", "cause-poison-1", "invalid_event_envelope: test", 10)

	var count int
	var traceID, reason string
	err := pool.QueryRow(ctx, `
		SELECT count(*)::int, max(trace_id), max(failure_reason)
		FROM gateway_poison_events
		WHERE consumer_name = 'uat-consumer' AND subject = 'order.created'
	`).Scan(&count, &traceID, &reason)
	if err != nil {
		t.Fatal(err)
	}
	if count < 1 {
		t.Fatal("expected durable poison row before NATS termination semantics")
	}
	if traceID != "trace-poison-1" {
		t.Fatalf("trace_id = %q", traceID)
	}
	if reason == "" {
		t.Fatal("failure_reason must be persisted")
	}
}
