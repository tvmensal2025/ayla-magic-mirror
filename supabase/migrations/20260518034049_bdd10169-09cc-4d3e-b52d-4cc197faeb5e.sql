ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS last_new_lead_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_handoff_notified_at timestamptz;