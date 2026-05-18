-- Narrative Life Track + FK alignment for Supabase / Postgres (pgvector).
-- Idempotent sections use IF NOT EXISTS / guarded renames where applicable.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- users: canonical narrative text + embedding for retrieval / ranking
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS life_track_story text DEFAULT 'New user profile initiated.';

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS story_embedding vector(768);

-- ---------------------------------------------------------------------------
-- product_validation_results: product_id → products (rename legacy column if present)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'product_validation_results'
          AND column_name = 'mypal_product_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'product_validation_results'
          AND column_name = 'product_id'
    ) THEN
        ALTER TABLE public.product_validation_results
            RENAME COLUMN mypal_product_id TO product_id;
    END IF;
END $$;

ALTER TABLE public.product_validation_results
    DROP CONSTRAINT IF EXISTS product_validation_results_mypal_product_id_fkey;

ALTER TABLE public.product_validation_results
    DROP CONSTRAINT IF EXISTS product_validation_results_product_id_fkey;

ALTER TABLE public.product_validation_results
    ADD CONSTRAINT product_validation_results_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products (id);

-- ---------------------------------------------------------------------------
-- seller_performance_summaries: seller_id → users only (no vendor_id in refined schema)
-- ---------------------------------------------------------------------------
ALTER TABLE public.seller_performance_summaries
    DROP CONSTRAINT IF EXISTS seller_performance_summaries_seller_id_fkey;

ALTER TABLE public.seller_performance_summaries
    ADD CONSTRAINT seller_performance_summaries_seller_id_fkey
        FOREIGN KEY (seller_id) REFERENCES public.users (id);

COMMIT;
