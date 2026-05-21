ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_by uuid;