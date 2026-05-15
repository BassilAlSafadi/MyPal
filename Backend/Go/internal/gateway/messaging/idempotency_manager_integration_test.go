package messaging_test

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"mypal/api/go/internal/gateway/messaging"
	"mypal/api/go/internal/gateway/testutil"
)

func newMessagingTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := testutil.RequirePostgres(t)
	ctx := context.Background()
	adminPool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("admin pool: %v", err)
	}
	t.Cleanup(adminPool.Close)
	schema := "msg_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err := adminPool.Exec(ctx, `CREATE SCHEMA `+schema); err != nil {
		t.Fatalf("schema: %v", err)
	}
	t.Cleanup(func() {
		_, _ = adminPool.Exec(context.Background(), `DROP SCHEMA IF EXISTS `+schema+` CASCADE`)
	})
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if cfg.ConnConfig.RuntimeParams == nil {
		cfg.ConnConfig.RuntimeParams = map[string]string{}
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(ctx, `
		CREATE TABLE processed_events (
			event_id text NOT NULL,
			consumer text NOT NULL,
			processed_at timestamp without time zone NOT NULL,
			PRIMARY KEY (event_id, consumer)
		);
	`); err != nil {
		t.Fatalf("ddl: %v", err)
	}
	return pool
}

func TestExecuteWithIdempotencyDifferentConsumersSameEventID(t *testing.T) {
	pool := newMessagingTestPool(t)
	im := messaging.NewIdempotencyManager(pool)
	ctx := context.Background()

	var c1, c2 int
	_, err := im.ExecuteWithIdempotency(ctx, "evt-1", "consumer-a", func(context.Context) error {
		c1++
		return nil
	})
	if err != nil {
		t.Fatalf("a: %v", err)
	}
	_, err = im.ExecuteWithIdempotency(ctx, "evt-1", "consumer-b", func(context.Context) error {
		c2++
		return nil
	})
	if err != nil {
		t.Fatalf("b: %v", err)
	}
	if c1 != 1 || c2 != 1 {
		t.Fatalf("both consumers should execute once, got c1=%d c2=%d", c1, c2)
	}
}
