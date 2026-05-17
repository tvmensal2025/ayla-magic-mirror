ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_origin text NOT NULL DEFAULT 'whatsapp_lead';

CREATE INDEX IF NOT EXISTS idx_customers_consultant_origin
  ON public.customers (consultant_id, customer_origin);

-- Backfill: registros vindos do sync iGreen
UPDATE public.customers
   SET customer_origin = 'igreen_sync'
 WHERE customer_origin = 'whatsapp_lead'
   AND (igreen_code IS NOT NULL OR andamento_igreen IS NOT NULL);

ALTER TABLE public.customers
  ADD CONSTRAINT customers_customer_origin_check
  CHECK (customer_origin IN ('igreen_sync','whatsapp_lead','manual'));