
-- 1) Backfill: liga Captação manual em TODOS os clientes existentes
UPDATE public.customers
SET capture_mode = 'manual',
    capture_started_at = COALESCE(capture_started_at, now())
WHERE capture_mode IS DISTINCT FROM 'manual';

-- 2) Simplifica o trigger: TODO novo lead nasce em modo manual
CREATE OR REPLACE FUNCTION public.set_default_capture_mode()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.capture_mode IS NULL OR NEW.capture_mode = 'auto' THEN
    NEW.capture_mode := 'manual';
  END IF;
  IF NEW.capture_started_at IS NULL THEN
    NEW.capture_started_at := now();
  END IF;
  RETURN NEW;
END;
$$;
