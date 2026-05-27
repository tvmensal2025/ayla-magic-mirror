
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS source_campaign_id UUID REFERENCES public.facebook_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_source_campaign ON public.customers(source_campaign_id) WHERE source_campaign_id IS NOT NULL;
