package messaging

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/nats-io/nats.go"
)

const (
	HeaderTraceID       = "X-Trace-ID"
	HeaderCorrelationID = "X-Correlation-ID"
	HeaderCausationID   = "X-Causation-ID"
	HeaderOutboxEventID = "X-Outbox-Event-ID"
	HeaderEventType     = "X-Event-Type"
)

type OutboxPublishMessage struct {
	EventID   string
	EventType string
	Subject   string
	Data      []byte
	TraceID   string
}

type OutboxPublisher interface {
	PublishOutbox(ctx context.Context, msg OutboxPublishMessage) error
}

// EventBus represents the NATS JetStream publisher/subscriber.
type EventBus struct {
	nc *nats.Conn
	js nats.JetStreamContext
}

// NewEventBus initializes a NATS connection and JetStream context.
func NewEventBus(url string) (*EventBus, error) {
	nc, err := nats.Connect(url)
	if err != nil {
		return nil, err
	}

	js, err := nc.JetStream()
	if err != nil {
		nc.Close()
		return nil, err
	}

	return &EventBus{
		nc: nc,
		js: js,
	}, nil
}

// SetupStreams scaffolds the necessary JetStream streams.
func (eb *EventBus) SetupStreams() error {
	// Create Orders stream
	_, err := eb.js.AddStream(&nats.StreamConfig{
		Name:     "ORDERS",
		Subjects: []string{"order.>"},
		Storage:  nats.FileStorage, // Durable persistence
	})
	if err != nil && err != nats.ErrStreamNameAlreadyInUse {
		return err
	}

	// Create Inventory stream
	_, err = eb.js.AddStream(&nats.StreamConfig{
		Name:     "INVENTORY",
		Subjects: []string{"inventory.>"},
		Storage:  nats.FileStorage,
	})
	if err != nil && err != nats.ErrStreamNameAlreadyInUse {
		return err
	}

	// Create Checkout stream
	_, err = eb.js.AddStream(&nats.StreamConfig{
		Name:     "CHECKOUT",
		Subjects: []string{"checkout.>"},
		Storage:  nats.FileStorage,
	})
	if err != nil && err != nats.ErrStreamNameAlreadyInUse {
		return err
	}

	// Phase 4: DLQ Streams
	dlqStreams := []string{"DLQ_ORDERS", "DLQ_INVENTORY", "DLQ_AI", "DLQ_CHECKOUT"}
	for _, streamName := range dlqStreams {
		_, err = eb.js.AddStream(&nats.StreamConfig{
			Name:     streamName,
			Subjects: []string{fmt.Sprintf("%s.>", streamName)},
			Storage:  nats.FileStorage,
		})
		if err != nil && err != nats.ErrStreamNameAlreadyInUse {
			return err
		}
	}

	slog.Info("messaging: NATS JetStream and DLQ streams configured")
	return nil
}

// Publish publishes an event payload to JetStream and waits for the server ack.
func (eb *EventBus) Publish(subject string, data []byte) error {
	return eb.publishMessage(context.Background(), OutboxPublishMessage{
		Subject: subject,
		Data:    data,
	})
}

// PublishOutbox publishes a durable outbox event after the outbox claim transaction
// has committed. The outbox row ID is sent as the JetStream message ID so duplicate
// attempts are broker-idempotent while preserving the original event body.
func (eb *EventBus) PublishOutbox(ctx context.Context, msg OutboxPublishMessage) error {
	return eb.publishMessage(ctx, msg)
}

func (eb *EventBus) IsConnected() bool {
	return eb != nil && eb.nc != nil && eb.nc.IsConnected()
}

func (eb *EventBus) publishMessage(ctx context.Context, event OutboxPublishMessage) error {
	msg := newNATSMessage(event)
	_, err := eb.js.PublishMsg(msg, nats.Context(ctx))
	return err
}

func newNATSMessage(event OutboxPublishMessage) *nats.Msg {
	msg := &nats.Msg{
		Subject: event.Subject,
		Data:    event.Data,
		Header:  nats.Header{},
	}

	if event.EventID != "" {
		msg.Header.Set(nats.MsgIdHdr, event.EventID)
		msg.Header.Set(HeaderOutboxEventID, event.EventID)
	}
	if event.EventType != "" {
		msg.Header.Set(HeaderEventType, event.EventType)
	}
	if event.TraceID != "" {
		msg.Header.Set(HeaderTraceID, event.TraceID)
		msg.Header.Set(HeaderCorrelationID, event.TraceID)
		msg.Header.Set(HeaderCausationID, event.TraceID)
	}

	return msg
}

// Close gracefully closes the NATS connection.
func (eb *EventBus) Close() {
	if eb.nc != nil {
		eb.nc.Close()
	}
}
