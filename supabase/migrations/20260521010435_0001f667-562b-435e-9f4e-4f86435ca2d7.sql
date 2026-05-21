-- 1) Função util para logar evento de captura sem duplicar
CREATE OR REPLACE FUNCTION public.log_capture_event_if_new(
  _consultant_id uuid,
  _customer_id uuid,
  _field text,
  _source text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _consultant_id IS NULL OR _customer_id IS NULL THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.capture_field_events
     WHERE customer_id = _customer_id AND field = _field
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.capture_field_events
    (consultant_id, customer_id, field, source)
  VALUES (_consultant_id, _customer_id, _field, COALESCE(_source, 'auto'));
EXCEPTION WHEN OTHERS THEN
  -- nunca quebrar o INSERT/UPDATE do customer por causa da gameficação
  RAISE WARNING 'log_capture_event_if_new failed: %', SQLERRM;
END;
$$;

-- 2) Trigger AFTER INSERT em customers: marca "lead_entrou"
CREATE OR REPLACE FUNCTION public.customers_gamify_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.log_capture_event_if_new(
    NEW.consultant_id, NEW.id, 'lead_entrou', COALESCE(NEW.customer_origin, 'auto')
  );
  -- Se já veio com nome válido (ex: Excel), conta como nome capturado
  IF NEW.name IS NOT NULL
     AND length(trim(NEW.name)) > 2
     AND NEW.name !~ '^\(\d{2}\)\s*\d' THEN
    PERFORM public.log_capture_event_if_new(
      NEW.consultant_id, NEW.id, 'name', 'auto'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_gamify_insert ON public.customers;
CREATE TRIGGER trg_customers_gamify_insert
AFTER INSERT ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.customers_gamify_on_insert();

-- 3) Trigger AFTER UPDATE: cada campo relevante que sai de vazio→preenchido
CREATE OR REPLACE FUNCTION public.customers_gamify_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- name
  IF NEW.name IS DISTINCT FROM OLD.name
     AND NEW.name IS NOT NULL
     AND length(trim(NEW.name)) > 2
     AND NEW.name !~ '^\(\d{2}\)\s*\d' THEN
    PERFORM public.log_capture_event_if_new(NEW.consultant_id, NEW.id, 'name', 'auto');
  END IF;
  -- electricity_bill_value
  IF NEW.electricity_bill_value IS DISTINCT FROM OLD.electricity_bill_value
     AND COALESCE(NEW.electricity_bill_value, 0) > 0 THEN
    PERFORM public.log_capture_event_if_new(NEW.consultant_id, NEW.id, 'electricity_bill_value', 'auto');
  END IF;
  -- portal_submitted_at (cadastro finalizado)
  IF NEW.portal_submitted_at IS NOT NULL AND OLD.portal_submitted_at IS NULL THEN
    PERFORM public.log_capture_event_if_new(NEW.consultant_id, NEW.id, 'cadastro_finalizado', 'auto');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_gamify_update ON public.customers;
CREATE TRIGGER trg_customers_gamify_update
AFTER UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.customers_gamify_on_update();

-- 4) Backfill de eventos para leads das últimas 72h
INSERT INTO public.capture_field_events (consultant_id, customer_id, field, source)
SELECT c.consultant_id, c.id, 'lead_entrou', COALESCE(c.customer_origin, 'auto')
  FROM public.customers c
 WHERE c.created_at > now() - interval '72 hours'
   AND c.consultant_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.capture_field_events e
      WHERE e.customer_id = c.id AND e.field = 'lead_entrou'
   );

-- 5) Destravar Marcia: reseta para pedir o nome
UPDATE public.customers
   SET conversation_step = 'aguardando_nome',
       bot_paused = false,
       bot_paused_reason = NULL,
       bot_paused_at = NULL,
       bot_paused_until = NULL,
       assigned_human_id = NULL,
       custom_step_retries = 0,
       custom_step_retries_step = NULL,
       last_custom_prompt_at = NULL,
       updated_at = now()
 WHERE phone_whatsapp = '5511916827893'
   AND name_source = 'unknown';