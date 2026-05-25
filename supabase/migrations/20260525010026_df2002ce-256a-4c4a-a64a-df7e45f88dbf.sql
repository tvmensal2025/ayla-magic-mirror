DROP INDEX IF EXISTS public.idx_customers_phone_consultant;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_consultant_production
ON public.customers (phone_whatsapp, consultant_id)
WHERE COALESCE(is_test_lead, false) = false
  AND COALESCE(is_sandbox, false) = false;

CREATE INDEX IF NOT EXISTS idx_customers_phone_consultant_test_lookup
ON public.customers (phone_whatsapp, consultant_id, is_test_lead, is_sandbox);