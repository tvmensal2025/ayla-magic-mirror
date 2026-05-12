DROP INDEX IF EXISTS idx_customers_phone_consultant;
CREATE UNIQUE INDEX idx_customers_phone_consultant ON public.customers (phone_whatsapp, consultant_id);