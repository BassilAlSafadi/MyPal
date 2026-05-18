using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPal.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOutboxPublishLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'Id'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'id'
                    ) THEN
                        ALTER TABLE public.outbox_events RENAME COLUMN "Id" TO id;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'Type'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'type'
                    ) THEN
                        ALTER TABLE public.outbox_events RENAME COLUMN "Type" TO type;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'Payload'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'payload'
                    ) THEN
                        ALTER TABLE public.outbox_events RENAME COLUMN "Payload" TO payload;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'TraceId'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'trace_id'
                    ) THEN
                        ALTER TABLE public.outbox_events RENAME COLUMN "TraceId" TO trace_id;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'CreatedAt'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'created_at'
                    ) THEN
                        ALTER TABLE public.outbox_events RENAME COLUMN "CreatedAt" TO created_at;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'ProcessedAt'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'processed_at'
                    ) THEN
                        ALTER TABLE public.outbox_events RENAME COLUMN "ProcessedAt" TO processed_at;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'Error'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'error'
                    ) THEN
                        ALTER TABLE public.outbox_events RENAME COLUMN "Error" TO error;
                    END IF;
                END $$;

                ALTER TABLE public.outbox_events
                    ADD COLUMN IF NOT EXISTS publish_status text NOT NULL DEFAULT 'pending',
                    ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS last_publish_attempt_at timestamp with time zone NULL,
                    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

                UPDATE public.outbox_events
                SET publish_status = CASE
                    WHEN processed_at IS NOT NULL THEN 'published'
                    WHEN error IS NOT NULL AND error <> '' THEN 'failed'
                    ELSE 'pending'
                END
                WHERE publish_status = 'pending';

                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'CK_outbox_events_publish_status'
                    ) THEN
                        ALTER TABLE public.outbox_events
                            ADD CONSTRAINT "CK_outbox_events_publish_status"
                            CHECK (publish_status IN ('pending', 'publishing', 'published', 'failed'));
                    END IF;
                END $$;

                CREATE INDEX IF NOT EXISTS "IX_outbox_events_publish_status_created_at"
                    ON public.outbox_events (publish_status, created_at);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP INDEX IF EXISTS public."IX_outbox_events_publish_status_created_at";
                ALTER TABLE public.outbox_events
                    DROP CONSTRAINT IF EXISTS "CK_outbox_events_publish_status",
                    DROP COLUMN IF EXISTS last_publish_attempt_at,
                    DROP COLUMN IF EXISTS publish_attempts,
                    DROP COLUMN IF EXISTS publish_status,
                    DROP COLUMN IF EXISTS updated_at;
                """);
        }
    }
}
