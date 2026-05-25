ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_test_lead boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_customers_is_test_lead
  ON public.customers (is_test_lead) WHERE is_test_lead = true;

COMMENT ON COLUMN public.customers.is_test_lead IS
  'Marca leads criados via simulador em Modo Real — excluídos de métricas/CRM principal mas usam fluxo 100% real (OCR/portal/OTP/facial).';