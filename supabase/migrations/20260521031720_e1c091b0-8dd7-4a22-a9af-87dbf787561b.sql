ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS bill_data_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS bill_data_confirmation_by text,
  ADD COLUMN IF NOT EXISTS doc_data_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS doc_data_confirmation_by text;