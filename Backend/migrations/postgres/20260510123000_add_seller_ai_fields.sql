-- Migration: Add AI fields for seller performance summaries
-- Adds columns to store AI-generated summaries, complaint themes, sentiment score, and timestamps

BEGIN;

ALTER TABLE public.seller_performance_summaries
    ADD COLUMN IF NOT EXISTS ai_generated_summary text;

ALTER TABLE public.seller_performance_summaries
    ADD COLUMN IF NOT EXISTS top_complaint_themes jsonb;

ALTER TABLE public.seller_performance_summaries
    ADD COLUMN IF NOT EXISTS sentiment_score numeric(5,4);

ALTER TABLE public.seller_performance_summaries
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.seller_performance_summaries
    ADD COLUMN IF NOT EXISTS summary_period_start date;

ALTER TABLE public.seller_performance_summaries
    ADD COLUMN IF NOT EXISTS summary_period_end date;

-- Grandma-first usability metric (1-10)
ALTER TABLE public.seller_performance_summaries
    ADD COLUMN IF NOT EXISTS grandma_score integer;

COMMIT;
