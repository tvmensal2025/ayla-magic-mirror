
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS lead_source text;

CREATE INDEX IF NOT EXISTS idx_customers_consultant_lead_source
  ON public.customers (consultant_id, lead_source);

COMMENT ON COLUMN public.customers.lead_source IS
  'Origem de aquisição do lead (ex: meta_ads, google_ads, organic, indicacao). NULL = não classificado.';
