package uat_test

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"mypal/api/go/internal/gateway/testutil"
)

// TestUAT_PublicSchemaAlignedWithMigrations runs against public schema after EF migrations.
// Enable with: UAT_VERIFY_PUBLIC_SCHEMA=1 and POSTGRES_URL (or POSTGRES_TEST_URL).
func TestUAT_PublicSchemaAlignedWithMigrations(t *testing.T) {
	if os.Getenv("UAT_VERIFY_PUBLIC_SCHEMA") != "1" {
		t.Skip("set UAT_VERIFY_PUBLIC_SCHEMA=1 to verify public schema after migrations")
	}

	dsn := testutil.RequirePostgres(t)
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ConnConfig.RuntimeParams == nil {
		cfg.ConnConfig.RuntimeParams = map[string]string{}
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = "public"

	ctx := context.Background()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	checks := []struct{ table, column string }{
		{"saga_states", "saga_id"},
		{"saga_states", "correlation_id"},
		{"saga_states", "retry_count"},
		{"saga_steps", "timestamp"},
		{"api_idempotency", "fingerprint"},
		{"gateway_poison_events", "failure_reason"},
		{"processed_events", "consumer"},
		{"outbox_events", "publish_status"},
	}
	for _, c := range checks {
		var exists bool
		err := pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
			)`, c.table, c.column).Scan(&exists)
		if err != nil {
			t.Fatalf("%s.%s: %v", c.table, c.column, err)
		}
		if !exists {
			t.Fatalf("public schema drift: missing %s.%s (run EF migrations)", c.table, c.column)
		}
	}

	var pkCols int
	err = pool.QueryRow(ctx, `
		SELECT count(*)::int FROM information_schema.key_column_usage
		WHERE table_schema = 'public' AND table_name = 'processed_events'
		  AND constraint_name = 'PK_processed_events'
	`).Scan(&pkCols)
	if err != nil {
		t.Fatal(err)
	}
	if pkCols < 2 {
		t.Fatalf("processed_events PK must be composite (event_id, consumer), got %d key columns", pkCols)
	}
}
