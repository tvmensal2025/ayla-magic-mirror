ALTER TABLE public.facebook_connections
  ADD COLUMN IF NOT EXISTS custom_audience_id text,
  ADD COLUMN IF NOT EXISTS lookalike_audience_id text,
  ADD COLUMN IF NOT EXISTS audience_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS audience_source_count integer;