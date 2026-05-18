using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPal.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class UatDistributedCorrectness : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                -- Align processed_events with gateway ON CONFLICT (event_id, consumer)
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'public.processed_events'::regclass
                          AND contype = 'p'
                          AND conname = 'PK_processed_events'
                    ) THEN
                        ALTER TABLE public.processed_events DROP CONSTRAINT "PK_processed_events";
                    END IF;
                END $$;

                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'public.processed_events'::regclass
                          AND contype = 'p'
                          AND conname = 'PK_processed_events'
                    ) THEN
                        ALTER TABLE public.processed_events
                            ADD CONSTRAINT "PK_processed_events" PRIMARY KEY (event_id, consumer);
                    END IF;
                END $$;

                -- Gateway saga + orchestration columns (authoritative table remains saga_states)
                ALTER TABLE public.saga_states
                    ADD COLUMN IF NOT EXISTS correlation_id text NOT NULL DEFAULT '',
                    ADD COLUMN IF NOT EXISTS causation_id text NOT NULL DEFAULT '',
                    ADD COLUMN IF NOT EXISTS timeout_at timestamp with time zone NULL,
                    ADD COLUMN IF NOT EXISTS failure_reason text NULL,
                    ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

                CREATE TABLE IF NOT EXISTS public.saga_steps (
                    id text NOT NULL,
                    saga_id text NOT NULL,
                    step_name text NOT NULL,
                    execution_order integer NOT NULL,
                    status text NOT NULL,
                    "timestamp" timestamp with time zone NOT NULL,
                    compensation_required boolean NOT NULL DEFAULT false,
                    compensation_completed boolean NOT NULL DEFAULT false,
                    error_details text NULL,
                    CONSTRAINT "PK_saga_steps" PRIMARY KEY (id),
                    CONSTRAINT "FK_saga_steps_saga_states_saga_id" FOREIGN KEY (saga_id)
                        REFERENCES public.saga_states (saga_id) ON DELETE CASCADE,
                    CONSTRAINT "UQ_saga_steps_saga_execution" UNIQUE (saga_id, execution_order)
                );

                CREATE TABLE IF NOT EXISTS public.api_idempotency (
                    idempotency_key text NOT NULL,
                    fingerprint text NOT NULL,
                    correlation_id text NOT NULL,
                    status text NOT NULL,
                    status_code integer NULL,
                    response_payload bytea NULL,
                    created_at timestamp with time zone NOT NULL,
                    updated_at timestamp with time zone NOT NULL,
                    expires_at timestamp with time zone NOT NULL,
                    CONSTRAINT "PK_api_idempotency" PRIMARY KEY (idempotency_key)
                );

                CREATE INDEX IF NOT EXISTS "IX_api_idempotency_status_updated_at"
                    ON public.api_idempotency (status, updated_at);

                CREATE TABLE IF NOT EXISTS public.gateway_poison_events (
                    id uuid NOT NULL,
                    consumer_name text NOT NULL,
                    subject text NOT NULL,
                    payload bytea NOT NULL,
                    headers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
                    trace_id text NOT NULL DEFAULT '',
                    correlation_id text NOT NULL DEFAULT '',
                    causation_id text NOT NULL DEFAULT '',
                    failure_reason text NOT NULL,
                    delivery_count bigint NOT NULL,
                    created_at timestamp with time zone NOT NULL DEFAULT now(),
                    CONSTRAINT "PK_gateway_poison_events" PRIMARY KEY (id)
                );

                CREATE INDEX IF NOT EXISTS "IX_gateway_poison_events_created_at"
                    ON public.gateway_poison_events (created_at);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP INDEX IF EXISTS public."IX_gateway_poison_events_created_at";
                DROP TABLE IF EXISTS public.gateway_poison_events;

                DROP INDEX IF EXISTS public."IX_api_idempotency_status_updated_at";
                DROP TABLE IF EXISTS public.api_idempotency;

                DROP TABLE IF EXISTS public.saga_steps;

                ALTER TABLE public.saga_states
                    DROP COLUMN IF EXISTS retry_count,
                    DROP COLUMN IF EXISTS failure_reason,
                    DROP COLUMN IF EXISTS timeout_at,
                    DROP COLUMN IF EXISTS causation_id,
                    DROP COLUMN IF EXISTS correlation_id;

                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'public.processed_events'::regclass
                          AND contype = 'p'
                          AND conname = 'PK_processed_events'
                    ) THEN
                        ALTER TABLE public.processed_events DROP CONSTRAINT "PK_processed_events";
                    END IF;
                END $$;

                ALTER TABLE public.processed_events
                    ADD CONSTRAINT "PK_processed_events" PRIMARY KEY (event_id);
                """);
        }
    }
}
