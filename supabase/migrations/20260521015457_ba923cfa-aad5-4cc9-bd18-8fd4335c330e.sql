-- Captação manual por padrão em todo lead novo + controle de "nome pedido"

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS name_ask_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.customers_default_capture_mode()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se já vem cadastro completo (name + cpf), não força manual
  IF NEW.name IS NOT NULL AND length(trim(NEW.name)) > 0
     AND NEW.cpf IS NOT NULL AND length(trim(NEW.cpf)) > 0 THEN
    RETURN NEW;
  END IF;

  -- Default: manual + timestamp (a menos que o caller tenha setado outra coisa explicitamente diferente de auto/null)
  IF NEW.capture_mode IS NULL OR NEW.capture_mode = 'auto' THEN
    NEW.capture_mode := 'manual';
    IF NEW.capture_started_at IS NULL THEN
      NEW.capture_started_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_default_capture_mode ON public.customers;
CREATE TRIGGER trg_customers_default_capture_mode
BEFORE INSERT ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.customers_default_capture_mode();