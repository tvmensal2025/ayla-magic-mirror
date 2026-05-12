-- Tracking ponta-a-ponta de anúncios

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS lead_source jsonb;

CREATE INDEX IF NOT EXISTS idx_customers_lead_source_campaign
  ON public.customers ((lead_source->>'campaign_id'))
  WHERE lead_source IS NOT NULL;

ALTER TABLE public.facebook_campaigns
  ADD COLUMN IF NOT EXISTS distribuidora text,
  ADD COLUMN IF NOT EXISTS pixel_event_optimized text DEFAULT 'Lead';

ALTER TABLE public.facebook_metrics_daily
  ADD COLUMN IF NOT EXISTS complete_registrations integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customers_acquired integer NOT NULL DEFAULT 0;
