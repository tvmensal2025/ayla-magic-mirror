ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS link_facial TEXT,
  ADD COLUMN IF NOT EXISTS facial_confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_conversation_step ON public.customers(conversation_step);