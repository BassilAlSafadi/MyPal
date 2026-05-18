package messaging

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/nats-io/nats.go"
)

type fakeConsumerDelivery struct {
	subject string
	data    []byte
	header  nats.Header
	acked   bool
	naked   bool
	termed  bool
}

func (d *fakeConsumerDelivery) Data() []byte {
	return d.data
}

func (d *fakeConsumerDelivery) Header() nats.Header {
	return d.header
}

func (d *fakeConsumerDelivery) Subject() string {
	return d.subject
}

func (d *fakeConsumerDelivery) Ack() error {
	d.acked = true
	return nil
}

func (d *fakeConsumerDelivery) Nak() error {
	d.naked = true
	return nil
}

func (d *fakeConsumerDelivery) NakWithDelay(delay time.Duration) error {
	d.naked = true
	return nil
}

func (d *fakeConsumerDelivery) Term() error {
	d.termed = true
	return nil
}

func (d *fakeConsumerDelivery) DeliveryCount() uint64 {
	return 1
}

func TestConsumerInvalidEnvelopeDoesNotAckOrDisappear(t *testing.T) {
	var logs bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	defer slog.SetDefault(prev)

	delivery := &fakeConsumerDelivery{
		subject: "order.created",
		data:    []byte(`{"trace_id":"trace-invalid","payload":{"order_id":"ord-1"}}`),
		header: nats.Header{
			HeaderTraceID: []string{"trace-invalid"},
		},
	}
	consumer := &Consumer{consumerName: "test-consumer"}

	consumer.processDelivery(context.Background(), delivery)

	if delivery.acked {
		t.Fatal("invalid envelope was acked")
	}
	if !delivery.termed {
		t.Fatal("invalid envelope was not terminated")
	}
	output := logs.String()
	if !strings.Contains(output, "consumer: invalid event envelope") {
		t.Fatalf("expected observable invalid envelope log, got %s", output)
	}
	if !strings.Contains(output, "trace-invalid") {
		t.Fatalf("trace metadata missing from invalid envelope log: %s", output)
	}
}

func TestConsumerInvalidJSONBecomesObservableFailure(t *testing.T) {
	var logs bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	defer slog.SetDefault(prev)

	delivery := &fakeConsumerDelivery{
		subject: "order.created",
		data:    []byte(`{"id":`),
		header: nats.Header{
			HeaderCorrelationID: []string{"trace-json"},
		},
	}
	consumer := &Consumer{consumerName: "test-consumer"}

	consumer.processDelivery(context.Background(), delivery)

	if delivery.acked {
		t.Fatal("malformed JSON was acked")
	}
	if !delivery.termed {
		t.Fatal("malformed JSON was not terminated")
	}
	output := logs.String()
	if !strings.Contains(output, "invalid event JSON") || !strings.Contains(output, "trace-json") {
		t.Fatalf("invalid JSON failure was not observable with trace context: %s", output)
	}
}

func TestExtractEventIdentityFallsBackToOutboxHeadersForReplayCompatibility(t *testing.T) {
	identity, err := extractEventIdentity([]byte(`{"payload":{"order_id":"ord-1"}}`), nats.Header{
		HeaderOutboxEventID: []string{"outbox-1"},
		HeaderTraceID:       []string{"trace-1"},
	})
	if err != nil {
		t.Fatalf("extractEventIdentity returned error: %v", err)
	}
	if identity.ID != "outbox-1" {
		t.Fatalf("identity ID = %q, want outbox-1", identity.ID)
	}
	if identity.TraceID != "trace-1" {
		t.Fatalf("trace ID = %q, want trace-1", identity.TraceID)
	}
}
