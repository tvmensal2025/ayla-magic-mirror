
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS source_campaign_id uuid,
  ADD COLUMN IF NOT EXISTS source_ad_id text,
  ADD COLUMN IF NOT EXISTS source_ctwa_clid text,
  ADD COLUMN IF NOT EXISTS source_referral jsonb;

CREATE INDEX IF NOT EXISTS idx_customers_source_campaign_id
  ON public.customers(source_campaign_id) WHERE source_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_source_ad_id
  ON public.customers(source_ad_id) WHERE source_ad_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acp_consultant_ad
  ON public.ad_creative_performance(consultant_id, fb_ad_id);
