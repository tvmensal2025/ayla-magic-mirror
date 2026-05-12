
ALTER TABLE public.platform_facebook_account
  ADD COLUMN IF NOT EXISTS custom_audience_id text,
  ADD COLUMN IF NOT EXISTS lookalike_audience_id text,
  ADD COLUMN IF NOT EXISTS audience_source_count integer;

ALTER TABLE public.facebook_metrics_daily
  ADD COLUMN IF NOT EXISTS cpl_by_placement jsonb;
