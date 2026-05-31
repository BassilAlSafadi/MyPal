-- Security hardening migration (applied to Supabase project cuwjzieetdyoxhidrhro).
--
-- C1: store a password hash per user so login can verify credentials.
-- H1: track the creator of each product so only the owner can edit/delete it.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS password_hash text;

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS idx_products_created_by ON public.products(created_by);
