-- Run against the target database after EF migrations:
--   psql "$POSTGRES_URL" -f scripts/uat/verify-schema.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(table_name || '.' || column_name, ', ')
  INTO missing
  FROM (
    VALUES
      ('saga_states', 'saga_id'),
      ('saga_states', 'status'),
      ('saga_states', 'correlation_id'),
      ('saga_states', 'retry_count'),
      ('saga_steps', 'timestamp'),
      ('api_idempotency', 'fingerprint'),
      ('gateway_poison_events', 'headers_json'),
      ('processed_events', 'consumer'),
      ('outbox_events', 'publish_status')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = required.table_name
      AND c.column_name = required.column_name
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Schema drift — missing columns: %', missing;
  END IF;
END $$;

-- processed_events must use composite PK (event_id, consumer)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.processed_events'::regclass
      AND contype = 'p'
      AND array_length(conkey, 1) = 2
  ) THEN
    RAISE EXCEPTION 'processed_events primary key must be (event_id, consumer)';
  END IF;
END $$;

SELECT 'schema_ok' AS result;
