ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS bill_holder_name text,
  ADD COLUMN IF NOT EXISTS doc_holder_name text,
  ADD COLUMN IF NOT EXISTS name_mismatch_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS name_mismatch_reason text,
  ADD COLUMN IF NOT EXISTS name_mismatch_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS bill_owner_relationship text;