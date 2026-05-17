ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS bot_processing_until timestamptz;

CREATE OR REPLACE FUNCTION public.try_lock_customer_processing(_customer_id uuid, _seconds int DEFAULT 25)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE public.customers
     SET bot_processing_until = now() + make_interval(secs => _seconds)
   WHERE id = _customer_id
     AND (bot_processing_until IS NULL OR bot_processing_until < now());
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_customer_processing_lock(_customer_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.customers SET bot_processing_until = NULL WHERE id = _customer_id;
$$;