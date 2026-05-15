package messaging

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
)

// Consumer represents a durable, replay-safe event consumer.
type Consumer struct {
	eb           *EventBus
	idempotency  *IdempotencyManager
	poisonDB     *pgxpool.Pool
	consumerName string
	stream       string
	subject      string
	handler      func(ctx context.Context, payload []byte) error
}

func NewConsumer(eb *EventBus, im *IdempotencyManager, poisonDB *pgxpool.Pool, name, stream, subject string, handler func(context.Context, []byte) error) *Consumer {
	return &Consumer{
		eb:           eb,
		idempotency:  im,
		poisonDB:     poisonDB,
		consumerName: name,
		stream:       stream,
		subject:      subject,
		handler:      handler,
	}
}

// Start creates a durable subscription and listens for events.
func (c *Consumer) Start(ctx context.Context) error {
	slog.Info("consumer: starting", "name", c.consumerName, "subject", c.subject)

	sub, err := c.eb.js.PullSubscribe(c.subject, c.consumerName, nats.BindStream(c.stream))
	if err != nil {
		return err
	}

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			default:
				msgs, err := sub.Fetch(10, nats.MaxWait(2*time.Second))
				if err != nil && err != nats.ErrTimeout {
					slog.Error("consumer: fetch error", "name", c.consumerName, "error", err)
					time.Sleep(1 * time.Second)
					continue
				}

				for _, msg := range msgs {
					c.processMsg(ctx, msg)
				}
			}
		}
	}()

	return nil
}

func (c *Consumer) processMsg(ctx context.Context, msg *nats.Msg) {
	c.processDelivery(ctx, natsDelivery{msg: msg})
}

type consumerDelivery interface {
	Data() []byte
	Header() nats.Header
	Subject() string
	Ack() error
	Nak() error
	NakWithDelay(delay time.Duration) error
	Term() error
	DeliveryCount() uint64
}

type natsDelivery struct {
	msg *nats.Msg
}

func (d natsDelivery) Data() []byte {
	return d.msg.Data
}

func (d natsDelivery) Header() nats.Header {
	return d.msg.Header
}

func (d natsDelivery) Subject() string {
	return d.msg.Subject
}

func (d natsDelivery) Ack() error {
	return d.msg.Ack()
}

func (d natsDelivery) Nak() error {
	return d.msg.Nak()
}

func (d natsDelivery) NakWithDelay(delay time.Duration) error {
	return d.msg.NakWithDelay(delay)
}

func (d natsDelivery) Term() error {
	return d.msg.Term()
}

func (d natsDelivery) DeliveryCount() uint64 {
	meta, err := d.msg.Metadata()
	if err != nil {
		return 1
	}
	return meta.NumDelivered
}

type eventIdentity struct {
	ID      string
	TraceID string
}

func (c *Consumer) processDelivery(ctx context.Context, msg consumerDelivery) {
	identity, err := extractEventIdentity(msg.Data(), msg.Header())
	if err != nil {
		traceID := traceIDFromHeader(msg.Header())
		corr := strings.TrimSpace(msg.Header().Get(HeaderCorrelationID))
		cause := strings.TrimSpace(msg.Header().Get(HeaderCausationID))
		slog.Error(
			"consumer: invalid event envelope, terminating",
			"name", c.consumerName,
			"subject", msg.Subject(),
			"trace_id", traceID,
			"error", err,
		)
		persistGatewayPoisonEvent(ctx, c.poisonDB, c.consumerName, msg.Subject(), msg.Data(), msg.Header(), traceID, corr, cause, "invalid_event_envelope: "+err.Error(), msg.DeliveryCount())
		if termErr := msg.Term(); termErr != nil {
			slog.Error(
				"consumer: failed to term invalid event envelope",
				"name", c.consumerName,
				"subject", msg.Subject(),
				"trace_id", traceID,
				"error", termErr,
			)
		}
		return
	}

	executed, err := c.idempotency.ExecuteWithIdempotency(ctx, identity.ID, c.consumerName, func(handlerCtx context.Context) error {
		return c.handler(handlerCtx, msg.Data())
	})

	if err != nil {
		slog.Error("consumer: handler or idempotency failed", "name", c.consumerName, "event_id", identity.ID, "trace_id", identity.TraceID, "error", err)

		if msg.DeliveryCount() >= 10 {
			slog.Error("consumer: max deliveries reached, terminating message", "name", c.consumerName, "event_id", identity.ID, "trace_id", identity.TraceID)
			corr := strings.TrimSpace(msg.Header().Get(HeaderCorrelationID))
			cause := strings.TrimSpace(msg.Header().Get(HeaderCausationID))
			persistGatewayPoisonEvent(ctx, c.poisonDB, c.consumerName, msg.Subject(), msg.Data(), msg.Header(), identity.TraceID, corr, cause, fmt.Sprintf("max_deliveries: handler_error: %v", err), msg.DeliveryCount())
			if termErr := msg.Term(); termErr != nil {
				slog.Error("consumer: failed to term exhausted message", "name", c.consumerName, "event_id", identity.ID, "trace_id", identity.TraceID, "error", termErr)
			}
			return
		}

		if nakErr := msg.NakWithDelay(5 * time.Second); nakErr != nil {
			slog.Error("consumer: failed to negative-ack handler error", "name", c.consumerName, "event_id", identity.ID, "trace_id", identity.TraceID, "error", nakErr)
		}
		return
	}

	if !executed {
		slog.Info("consumer: event already processed", "name", c.consumerName, "event_id", identity.ID, "trace_id", identity.TraceID)
	}

	if ackErr := msg.Ack(); ackErr != nil {
		slog.Error("consumer: failed to ack processed event", "name", c.consumerName, "event_id", identity.ID, "trace_id", identity.TraceID, "error", ackErr)
	}
}

func extractEventIdentity(data []byte, header nats.Header) (eventIdentity, error) {
	var envelope struct {
		ID      string `json:"id"`
		TraceID string `json:"trace_id"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return eventIdentity{TraceID: traceIDFromHeader(header)}, fmt.Errorf("invalid event JSON: %w", err)
	}

	identity := eventIdentity{
		ID:      strings.TrimSpace(envelope.ID),
		TraceID: strings.TrimSpace(envelope.TraceID),
	}
	if identity.ID == "" {
		identity.ID = strings.TrimSpace(header.Get(HeaderOutboxEventID))
	}
	if identity.ID == "" {
		identity.ID = strings.TrimSpace(header.Get(nats.MsgIdHdr))
	}
	if identity.TraceID == "" {
		identity.TraceID = traceIDFromHeader(header)
	}
	if identity.ID == "" {
		return identity, fmt.Errorf("missing event identity: expected envelope.id, %s, or %s", HeaderOutboxEventID, nats.MsgIdHdr)
	}

	return identity, nil
}

func traceIDFromHeader(header nats.Header) string {
	if traceID := strings.TrimSpace(header.Get(HeaderTraceID)); traceID != "" {
		return traceID
	}
	return strings.TrimSpace(header.Get(HeaderCorrelationID))
}
