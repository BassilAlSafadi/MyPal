package messaging

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"mypal/api/go/internal/gateway/testutil"
)

type scriptedOutboxStore struct {
	mu              sync.Mutex
	claims          [][]OutboxEvent
	claimOpen       bool
	claimFinished   bool
	claimCalls      int
	published       []string
	failed          []failedCall
	markPublishedFn func(string) error
	markFailedFn    func(context.Context, string, int, error) error
}

type failedCall struct {
	eventID string
	attempt int
	err     string
}

func (s *scriptedOutboxStore) ClaimBatch(context.Context, int, time.Duration) ([]OutboxEvent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.claimOpen = true
	defer func() {
		s.claimOpen = false
		s.claimFinished = true
		s.claimCalls++
	}()

	if s.claimCalls >= len(s.claims) {
		return nil, nil
	}

	events := make([]OutboxEvent, len(s.claims[s.claimCalls]))
	copy(events, s.claims[s.claimCalls])
	return events, nil
}

func (s *scriptedOutboxStore) MarkPublished(_ context.Context, eventID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.markPublishedFn != nil {
		if err := s.markPublishedFn(eventID); err != nil {
			return err
		}
	}
	s.published = append(s.published, eventID)
	return nil
}

func (s *scriptedOutboxStore) MarkFailed(ctx context.Context, eventID string, publishAttempt int, publishErr error) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.markFailedFn != nil {
		if err := s.markFailedFn(ctx, eventID, publishAttempt, publishErr); err != nil {
			return err
		}
	}

	errText := ""
	if publishErr != nil {
		errText = publishErr.Error()
	}
	s.failed = append(s.failed, failedCall{eventID: eventID, attempt: publishAttempt, err: errText})
	return nil
}

func (s *scriptedOutboxStore) isClaimOpen() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.claimOpen
}

func (s *scriptedOutboxStore) didClaimFinish() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.claimFinished
}

type recordingOutboxPublisher struct {
	mu               sync.Mutex
	messages         []OutboxPublishMessage
	errs             []error
	onPublish        func(OutboxPublishMessage) error
	onPublishContext func(context.Context, OutboxPublishMessage) error
}

func (p *recordingOutboxPublisher) PublishOutbox(ctx context.Context, msg OutboxPublishMessage) error {
	p.mu.Lock()
	call := len(p.messages)
	p.messages = append(p.messages, msg)
	p.mu.Unlock()

	if p.onPublishContext != nil {
		if err := p.onPublishContext(ctx, msg); err != nil {
			return err
		}
	}
	if p.onPublish != nil {
		if err := p.onPublish(msg); err != nil {
			return err
		}
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	if call < len(p.errs) {
		return p.errs[call]
	}
	return nil
}

func (p *recordingOutboxPublisher) snapshot() []OutboxPublishMessage {
	p.mu.Lock()
	defer p.mu.Unlock()

	out := make([]OutboxPublishMessage, len(p.messages))
	copy(out, p.messages)
	return out
}

func TestOutboxWorkerReleasesClaimBeforePublish(t *testing.T) {
	store := &scriptedOutboxStore{
		claims: [][]OutboxEvent{{
			{ID: "evt-1", Type: "order.created", Payload: `{"order_id":"ord-1"}`, TraceID: "trace-1", PublishAttempts: 1},
		}},
	}
	publisher := &recordingOutboxPublisher{
		onPublish: func(OutboxPublishMessage) error {
			if store.isClaimOpen() {
				t.Fatal("publish started while claim transaction was still open")
			}
			if !store.didClaimFinish() {
				t.Fatal("publish started before claim phase completed")
			}
			return nil
		},
	}

	worker := NewOutboxWorkerWithStore(store, publisher, time.Second)
	if err := worker.processBatch(context.Background()); err != nil {
		t.Fatalf("processBatch returned error: %v", err)
	}

	if got, want := store.published, []string{"evt-1"}; fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("published rows = %v, want %v", got, want)
	}
}

func TestOutboxWorkerPublishRetryUsesNewClaimAndFailureState(t *testing.T) {
	store := &scriptedOutboxStore{
		claims: [][]OutboxEvent{
			{{ID: "evt-1", Type: "order.created", Payload: `{"order_id":"ord-1"}`, TraceID: "trace-1", PublishAttempts: 1}},
			{{ID: "evt-1", Type: "order.created", Payload: `{"order_id":"ord-1"}`, TraceID: "trace-1", PublishAttempts: 2}},
		},
	}
	publisher := &recordingOutboxPublisher{
		errs: []error{errors.New("nats unavailable"), nil},
		onPublish: func(OutboxPublishMessage) error {
			if store.isClaimOpen() {
				t.Fatal("retry publish used an open claim transaction")
			}
			return nil
		},
	}

	worker := NewOutboxWorkerWithStore(store, publisher, time.Second)
	if err := worker.processBatch(context.Background()); err == nil {
		t.Fatal("first processBatch succeeded unexpectedly")
	}
	if err := worker.processBatch(context.Background()); err != nil {
		t.Fatalf("second processBatch returned error: %v", err)
	}

	if store.claimCalls != 2 {
		t.Fatalf("claim calls = %d, want 2", store.claimCalls)
	}
	if got := store.failed; len(got) != 1 || got[0].eventID != "evt-1" || got[0].attempt != 1 {
		t.Fatalf("failed state calls = %+v, want evt-1 attempt 1", got)
	}
	if got := store.published; len(got) != 1 || got[0] != "evt-1" {
		t.Fatalf("published calls = %v, want evt-1", got)
	}
}

func TestOutboxWorkerCrashAfterClaimBeforePublishRecoverable(t *testing.T) {
	store := &scriptedOutboxStore{
		claims: [][]OutboxEvent{{
			{ID: "evt-stale", Type: "inventory.reserved", Payload: `{"reservation_id":"res-1"}`, TraceID: "trace-stale", PublishAttempts: 4},
		}},
	}
	publisher := &recordingOutboxPublisher{}

	worker := NewOutboxWorkerWithStore(store, publisher, time.Second)
	if err := worker.processBatch(context.Background()); err != nil {
		t.Fatalf("processBatch returned error: %v", err)
	}

	if got := publisher.snapshot(); len(got) != 1 || got[0].EventID != "evt-stale" {
		t.Fatalf("published messages = %+v, want recovered stale event", got)
	}
	if got := store.published; len(got) != 1 || got[0] != "evt-stale" {
		t.Fatalf("published rows = %v, want evt-stale", got)
	}
}

func TestOutboxWorkerDuplicateAttemptsUseStableMessageIDAndPreservePayload(t *testing.T) {
	payload := `{"id":"contract-event-1","payload":{"order_id":"ord-1"}}`
	store := &scriptedOutboxStore{
		claims: [][]OutboxEvent{
			{{ID: "outbox-1", Type: "order.created", Payload: payload, TraceID: "trace-1", PublishAttempts: 1}},
			{{ID: "outbox-1", Type: "order.created", Payload: payload, TraceID: "trace-1", PublishAttempts: 2}},
		},
	}
	finalizeCalls := 0
	store.markPublishedFn = func(string) error {
		finalizeCalls++
		if finalizeCalls == 1 {
			return errors.New("db finalize unavailable")
		}
		return nil
	}
	publisher := &recordingOutboxPublisher{}

	worker := NewOutboxWorkerWithStore(store, publisher, time.Second)
	if err := worker.processBatch(context.Background()); err == nil {
		t.Fatal("first processBatch succeeded unexpectedly")
	}
	if err := worker.processBatch(context.Background()); err != nil {
		t.Fatalf("second processBatch returned error: %v", err)
	}

	messages := publisher.snapshot()
	if len(messages) != 2 {
		t.Fatalf("publish count = %d, want 2", len(messages))
	}
	for _, msg := range messages {
		if msg.EventID != "outbox-1" {
			t.Fatalf("message ID = %q, want stable outbox ID", msg.EventID)
		}
		if string(msg.Data) != payload {
			t.Fatalf("payload changed: %s", string(msg.Data))
		}
	}
}

func TestOutboxWorkerTelemetryMetadataSurvivesPublishFlow(t *testing.T) {
	store := &scriptedOutboxStore{
		claims: [][]OutboxEvent{{
			{ID: "evt-telemetry", Type: "order.created", Payload: `{"order_id":"ord-1"}`, TraceID: "trace-telemetry", PublishAttempts: 1},
		}},
	}
	publisher := &recordingOutboxPublisher{}

	worker := NewOutboxWorkerWithStore(store, publisher, time.Second)
	if err := worker.processBatch(context.Background()); err != nil {
		t.Fatalf("processBatch returned error: %v", err)
	}

	messages := publisher.snapshot()
	if len(messages) != 1 {
		t.Fatalf("publish count = %d, want 1", len(messages))
	}
	msg := messages[0]
	if msg.TraceID != "trace-telemetry" || msg.EventID != "evt-telemetry" || msg.EventType != "order.created" {
		t.Fatalf("metadata = %+v, want trace/event/type preserved", msg)
	}
}

func TestOutboxWorkerFinalizesFailedPublishAfterRootContextCancellation(t *testing.T) {
	store := &scriptedOutboxStore{
		claims: [][]OutboxEvent{{
			{ID: "evt-shutdown", Type: "order.created", Payload: `{"order_id":"ord-1"}`, TraceID: "trace-shutdown", PublishAttempts: 1},
		}},
	}
	markFailedCtxErr := make(chan error, 1)
	store.markFailedFn = func(ctx context.Context, _ string, _ int, _ error) error {
		markFailedCtxErr <- ctx.Err()
		return nil
	}

	publishStarted := make(chan struct{})
	publisher := &recordingOutboxPublisher{
		onPublishContext: func(ctx context.Context, _ OutboxPublishMessage) error {
			close(publishStarted)
			<-ctx.Done()
			return ctx.Err()
		},
	}

	rootCtx, cancel := context.WithCancel(context.Background())
	worker := NewOutboxWorkerWithStore(store, publisher, time.Second)
	errCh := make(chan error, 1)
	go func() {
		errCh <- worker.processBatch(rootCtx)
	}()

	<-publishStarted
	cancel()

	if err := <-errCh; err == nil {
		t.Fatal("processBatch succeeded unexpectedly")
	}
	if got := <-markFailedCtxErr; got != nil {
		t.Fatalf("failure finalization used canceled context: %v", got)
	}
	if got := store.failed; len(got) != 1 || got[0].eventID != "evt-shutdown" {
		t.Fatalf("failed rows = %+v, want evt-shutdown", got)
	}
}

func TestOutboxNATSMessageUsesStableHeadersAndPreservesPayload(t *testing.T) {
	payload := []byte(`{"id":"contract-event-1","payload":{"order_id":"ord-1"}}`)
	msg := newNATSMessage(OutboxPublishMessage{
		EventID:   "outbox-1",
		EventType: "order.created",
		Subject:   "order.created",
		Data:      payload,
		TraceID:   "trace-1",
	})

	if msg.Header.Get(nats.MsgIdHdr) != "outbox-1" {
		t.Fatalf("Nats-Msg-Id = %q, want outbox-1", msg.Header.Get(nats.MsgIdHdr))
	}
	if msg.Header.Get(HeaderTraceID) != "trace-1" || msg.Header.Get(HeaderCorrelationID) != "trace-1" || msg.Header.Get(HeaderCausationID) != "trace-1" {
		t.Fatalf("trace headers = %q/%q/%q, want trace-1", msg.Header.Get(HeaderTraceID), msg.Header.Get(HeaderCorrelationID), msg.Header.Get(HeaderCausationID))
	}
	if msg.Header.Get(HeaderOutboxEventID) != "outbox-1" || msg.Header.Get(HeaderEventType) != "order.created" {
		t.Fatalf("event headers not preserved: %v", msg.Header)
	}
	if string(msg.Data) != string(payload) {
		t.Fatalf("payload changed: %s", string(msg.Data))
	}
}

func TestOutboxWorkerConcurrentWorkersDoNotPublishSameClaim(t *testing.T) {
	store := newStatefulFakeStore([]OutboxEvent{
		{ID: "evt-1", Type: "order.created", Payload: `{}`, TraceID: "trace-1"},
		{ID: "evt-2", Type: "order.created", Payload: `{}`, TraceID: "trace-2"},
	})
	publisher := &recordingOutboxPublisher{}
	workerA := NewOutboxWorkerWithStore(store, publisher, time.Second)
	workerB := NewOutboxWorkerWithStore(store, publisher, time.Second)

	start := make(chan struct{})
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for _, worker := range []*OutboxWorker{workerA, workerB} {
		wg.Add(1)
		go func(w *OutboxWorker) {
			defer wg.Done()
			<-start
			errs <- w.processBatch(context.Background())
		}(worker)
	}
	close(start)
	wg.Wait()
	close(errs)

	for err := range errs {
		if err != nil {
			t.Fatalf("processBatch returned error: %v", err)
		}
	}

	messages := publisher.snapshot()
	seen := map[string]bool{}
	for _, msg := range messages {
		if seen[msg.EventID] {
			t.Fatalf("duplicate publish for %s", msg.EventID)
		}
		seen[msg.EventID] = true
	}
	if len(seen) != 2 {
		t.Fatalf("published IDs = %v, want both events exactly once", seen)
	}
}

type statefulFakeStore struct {
	mu     sync.Mutex
	events map[string]OutboxEvent
	status map[string]string
}

func newStatefulFakeStore(events []OutboxEvent) *statefulFakeStore {
	s := &statefulFakeStore{
		events: map[string]OutboxEvent{},
		status: map[string]string{},
	}
	for _, event := range events {
		s.events[event.ID] = event
		s.status[event.ID] = OutboxStatusPending
	}
	return s
}

func (s *statefulFakeStore) ClaimBatch(_ context.Context, limit int, _ time.Duration) ([]OutboxEvent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var claimed []OutboxEvent
	for id, event := range s.events {
		if len(claimed) == limit {
			break
		}
		if s.status[id] != OutboxStatusPending {
			continue
		}
		event.PublishAttempts++
		s.events[id] = event
		s.status[id] = OutboxStatusPublishing
		claimed = append(claimed, event)
	}
	return claimed, nil
}

func (s *statefulFakeStore) MarkPublished(_ context.Context, eventID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.status[eventID] = OutboxStatusPublished
	return nil
}

func (s *statefulFakeStore) MarkFailed(_ context.Context, eventID string, _ int, _ error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.status[eventID] = OutboxStatusFailed
	return nil
}

func TestPostgresOutboxStoreClaimCommitsBeforeBrokerIO(t *testing.T) {
	pool := newOutboxIntegrationPool(t)
	eventID := insertOutboxTestEvent(t, pool, OutboxStatusPending, 0, "now()")

	store := NewPostgresOutboxStore(pool)
	publisher := &recordingOutboxPublisher{
		onPublish: func(msg OutboxPublishMessage) error {
			tx, err := pool.Begin(context.Background())
			if err != nil {
				return err
			}
			defer tx.Rollback(context.Background())

			if _, err := tx.Exec(context.Background(), `SET LOCAL lock_timeout = '10ms'`); err != nil {
				return err
			}
			if _, err := tx.Exec(context.Background(), `
				UPDATE outbox_events
				SET error = error
				WHERE id = $1::uuid
			`, msg.EventID); err != nil {
				return fmt.Errorf("row was still locked during broker I/O: %w", err)
			}
			return tx.Commit(context.Background())
		},
	}

	worker := NewOutboxWorkerWithStore(store, publisher, time.Second)
	if err := worker.processBatch(context.Background()); err != nil {
		t.Fatalf("processBatch returned error: %v", err)
	}

	assertOutboxStatus(t, pool, eventID, OutboxStatusPublished)
}

func TestPostgresOutboxStoreDoesNotClaimStalePublishingRows(t *testing.T) {
	pool := newOutboxIntegrationPool(t)
	eventID := insertOutboxTestEvent(t, pool, OutboxStatusPublishing, 3, "now() - interval '10 minutes'")

	store := NewPostgresOutboxStore(pool)
	events, err := store.ClaimBatch(context.Background(), 10, 5*time.Minute)
	if err != nil {
		t.Fatalf("ClaimBatch returned error: %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("claimed stale publishing events = %+v, want none", events)
	}
	assertOutboxStatus(t, pool, eventID, OutboxStatusPublishing)
}

func TestPostgresOutboxRecoveryRecoversStalePublishingRows(t *testing.T) {
	pool := newOutboxIntegrationPool(t)
	eventID := insertOutboxTestEvent(t, pool, OutboxStatusPublishing, 3, "now() - interval '10 minutes'")

	store := NewPostgresOutboxStore(pool)
	recovered, err := store.RecoverStalePublishing(context.Background(), 10, 5*time.Minute)
	if err != nil {
		t.Fatalf("RecoverStalePublishing returned error: %v", err)
	}
	if recovered != 1 {
		t.Fatalf("recovered = %d, want 1", recovered)
	}
	assertOutboxStatus(t, pool, eventID, OutboxStatusPending)
}

func TestPostgresOutboxStoreConcurrentClaimsAreDisjoint(t *testing.T) {
	pool := newOutboxIntegrationPool(t)
	for i := 0; i < 20; i++ {
		insertOutboxTestEvent(t, pool, OutboxStatusPending, 0, "now()")
	}

	store := NewPostgresOutboxStore(pool)
	start := make(chan struct{})
	results := make(chan []OutboxEvent, 2)
	errs := make(chan error, 2)
	var wg sync.WaitGroup

	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			events, err := store.ClaimBatch(context.Background(), 20, 5*time.Minute)
			if err != nil {
				errs <- err
				return
			}
			results <- events
		}()
	}

	close(start)
	wg.Wait()
	close(results)
	close(errs)

	for err := range errs {
		t.Fatalf("ClaimBatch returned error: %v", err)
	}

	seen := map[string]bool{}
	for events := range results {
		for _, event := range events {
			if seen[event.ID] {
				t.Fatalf("duplicate claim for %s", event.ID)
			}
			seen[event.ID] = true
		}
	}
	if len(seen) != 20 {
		t.Fatalf("claimed %d events, want 20", len(seen))
	}
}

func TestPostgresOutboxRecoveryConcurrentReclaimsAreDeterministic(t *testing.T) {
	pool := newOutboxIntegrationPool(t)
	for i := 0; i < 20; i++ {
		insertOutboxTestEvent(t, pool, OutboxStatusPublishing, 1, "now() - interval '10 minutes'")
	}

	store := NewPostgresOutboxStore(pool)
	start := make(chan struct{})
	results := make(chan int64, 2)
	errs := make(chan error, 2)
	var wg sync.WaitGroup

	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			recovered, err := store.RecoverStalePublishing(context.Background(), 20, 5*time.Minute)
			if err != nil {
				errs <- err
				return
			}
			results <- recovered
		}()
	}

	close(start)
	wg.Wait()
	close(results)
	close(errs)

	for err := range errs {
		t.Fatalf("RecoverStalePublishing returned error: %v", err)
	}

	var total int64
	for recovered := range results {
		total += recovered
	}
	if total != 20 {
		t.Fatalf("total recovered = %d, want 20", total)
	}

	var remainingPublishing int
	if err := pool.QueryRow(context.Background(), `
		SELECT count(*)
		FROM outbox_events
		WHERE publish_status = 'publishing'
	`).Scan(&remainingPublishing); err != nil {
		t.Fatalf("count publishing rows: %v", err)
	}
	if remainingPublishing != 0 {
		t.Fatalf("publishing rows remaining = %d, want 0", remainingPublishing)
	}
}

func TestPostgresOutboxStoreFailedAttemptDoesNotOverridePublishedRace(t *testing.T) {
	pool := newOutboxIntegrationPool(t)
	eventID := insertOutboxTestEvent(t, pool, OutboxStatusPublishing, 2, "now()")

	store := NewPostgresOutboxStore(pool)
	if err := store.MarkPublished(context.Background(), eventID); err != nil {
		t.Fatalf("MarkPublished returned error: %v", err)
	}
	if err := store.MarkFailed(context.Background(), eventID, 2, errors.New("late failure")); err != nil {
		t.Fatalf("MarkFailed returned error: %v", err)
	}

	assertOutboxStatus(t, pool, eventID, OutboxStatusPublished)
}

func newOutboxIntegrationPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	dsn := testutil.RequirePostgres(t)

	ctx := context.Background()
	adminPool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("open admin pool: %v", err)
	}
	t.Cleanup(adminPool.Close)

	schema := "outbox_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err := adminPool.Exec(ctx, `CREATE SCHEMA `+schema); err != nil {
		t.Fatalf("create test schema: %v", err)
	}
	t.Cleanup(func() {
		_, _ = adminPool.Exec(context.Background(), `DROP SCHEMA IF EXISTS `+schema+` CASCADE`)
	})

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatalf("parse test dsn: %v", err)
	}
	if cfg.ConnConfig.RuntimeParams == nil {
		cfg.ConnConfig.RuntimeParams = map[string]string{}
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("open schema pool: %v", err)
	}
	t.Cleanup(pool.Close)

	if _, err := pool.Exec(ctx, `
		CREATE TABLE outbox_events (
			id uuid PRIMARY KEY,
			type text NOT NULL,
			payload jsonb NOT NULL,
			trace_id text NOT NULL,
			created_at timestamp with time zone NOT NULL DEFAULT now(),
			processed_at timestamp with time zone NULL,
			error text NULL,
			publish_status text NOT NULL DEFAULT 'pending',
			publish_attempts integer NOT NULL DEFAULT 0,
			last_publish_attempt_at timestamp with time zone NULL,
			updated_at timestamp with time zone NOT NULL DEFAULT now(),
			CONSTRAINT "CK_outbox_events_publish_status"
				CHECK (publish_status IN ('pending', 'publishing', 'published', 'failed'))
		);
		CREATE INDEX "IX_outbox_events_publish_status_created_at"
			ON outbox_events (publish_status, created_at);
	`); err != nil {
		t.Fatalf("create outbox table: %v", err)
	}

	return pool
}

func insertOutboxTestEvent(t *testing.T, pool *pgxpool.Pool, status string, attempts int, updatedAtExpr string) string {
	t.Helper()

	eventID := uuid.NewString()
	_, err := pool.Exec(context.Background(), fmt.Sprintf(`
		INSERT INTO outbox_events (
			id, type, payload, trace_id, created_at, processed_at, error,
			publish_status, publish_attempts, updated_at
		)
		VALUES (
			$1::uuid, 'order.created', '{"order_id":"ord-1"}'::jsonb, 'trace-1',
			now(), NULL, NULL, $2, $3, %s
		)
	`, updatedAtExpr), eventID, status, attempts)
	if err != nil {
		t.Fatalf("insert outbox event: %v", err)
	}
	return eventID
}

func assertOutboxStatus(t *testing.T, pool *pgxpool.Pool, eventID, want string) {
	t.Helper()

	var got string
	err := pool.QueryRow(context.Background(), `
		SELECT publish_status
		FROM outbox_events
		WHERE id = $1::uuid
	`, eventID).Scan(&got)
	if err != nil {
		t.Fatalf("read outbox status: %v", err)
	}
	if got != want {
		t.Fatalf("publish_status = %q, want %q", got, want)
	}
}
