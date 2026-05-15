package testutil

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UATPool returns a dedicated schema with DDL aligned to EF migrations + gateway runtime queries.
func UATPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	dsn := RequirePostgres(t)

	ctx := context.Background()
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("admin pool: %v", err)
	}
	t.Cleanup(admin.Close)

	schema := "uat_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err := admin.Exec(ctx, `CREATE SCHEMA `+schema); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), `DROP SCHEMA IF EXISTS `+schema+` CASCADE`)
	})

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatalf("parse dsn: %v", err)
	}
	if cfg.ConnConfig.RuntimeParams == nil {
		cfg.ConnConfig.RuntimeParams = map[string]string{}
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("schema pool: %v", err)
	}
	t.Cleanup(pool.Close)

	if _, err := pool.Exec(ctx, uatGatewayDDL); err != nil {
		t.Fatalf("apply uat ddl: %v", err)
	}

	return pool
}

// uatGatewayDDL mirrors canonical EF tables/columns used by gateway SQL at runtime.
const uatGatewayDDL = `
CREATE TABLE saga_states (
	saga_id text PRIMARY KEY,
	workflow text NOT NULL,
	status text NOT NULL,
	current_step text NOT NULL,
	completed_steps jsonb NOT NULL DEFAULT '[]',
	failed_step text,
	compensations jsonb NOT NULL DEFAULT '[]',
	correlation_id text NOT NULL DEFAULT '',
	causation_id text NOT NULL DEFAULT '',
	timeout_at timestamptz,
	failure_reason text,
	retry_count integer NOT NULL DEFAULT 0,
	updated_at timestamp without time zone NOT NULL
);

CREATE TABLE saga_steps (
	id text PRIMARY KEY,
	saga_id text NOT NULL REFERENCES saga_states(saga_id) ON DELETE CASCADE,
	step_name text NOT NULL,
	execution_order integer NOT NULL,
	status text NOT NULL,
	"timestamp" timestamptz NOT NULL,
	compensation_required boolean NOT NULL DEFAULT false,
	compensation_completed boolean NOT NULL DEFAULT false,
	error_details text,
	UNIQUE (saga_id, execution_order)
);

CREATE TABLE processed_events (
	event_id text NOT NULL,
	consumer text NOT NULL,
	processed_at timestamp without time zone NOT NULL,
	PRIMARY KEY (event_id, consumer)
);

CREATE TABLE api_idempotency (
	idempotency_key text PRIMARY KEY,
	fingerprint text NOT NULL,
	correlation_id text NOT NULL,
	status text NOT NULL,
	status_code integer,
	response_payload bytea,
	created_at timestamptz NOT NULL,
	updated_at timestamptz NOT NULL,
	expires_at timestamptz NOT NULL
);

CREATE INDEX IX_api_idempotency_status_updated_at ON api_idempotency (status, updated_at);

CREATE TABLE gateway_poison_events (
	id uuid PRIMARY KEY,
	consumer_name text NOT NULL,
	subject text NOT NULL,
	payload bytea NOT NULL,
	headers_json jsonb NOT NULL DEFAULT '{}',
	trace_id text NOT NULL DEFAULT '',
	correlation_id text NOT NULL DEFAULT '',
	causation_id text NOT NULL DEFAULT '',
	failure_reason text NOT NULL,
	delivery_count bigint NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
	id uuid PRIMARY KEY,
	type text NOT NULL,
	payload jsonb NOT NULL,
	trace_id text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	processed_at timestamptz,
	error text,
	publish_status text NOT NULL DEFAULT 'pending',
	publish_attempts integer NOT NULL DEFAULT 0,
	last_publish_attempt_at timestamptz,
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT CK_outbox_events_publish_status CHECK (publish_status IN ('pending', 'publishing', 'published', 'failed'))
);
`
