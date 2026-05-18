ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS custom_step_retries integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_step_retries_step text;