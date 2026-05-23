
-- Remove unique constraint to allow multiple sends of same media to same customer over time
DROP INDEX IF EXISTS public.ux_ai_slot_dispatch_log_customer_media;

-- Replace try_log_media_send: allow re-send after 10 minutes
CREATE OR REPLACE FUNCTION public.try_log_media_send(
  _consultant_id uuid,
  _customer_id uuid,
  _media_id uuid,
  _slot_key text,
  _kind text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _last_sent timestamptz;
BEGIN
  IF _customer_id IS NULL OR _media_id IS NULL THEN
    RETURN true;
  END IF;

  SELECT sent_at INTO _last_sent
    FROM public.ai_slot_dispatch_log
   WHERE customer_id = _customer_id
     AND media_id = _media_id
   ORDER BY sent_at DESC
   LIMIT 1;

  -- Bloqueia reenvio dentro de 10 minutos (anti duplo-clique / loop)
  IF _last_sent IS NOT NULL AND _last_sent > now() - interval '10 minutes' THEN
    RETURN false;
  END IF;

  INSERT INTO public.ai_slot_dispatch_log
    (consultant_id, customer_id, media_id, slot_key, variant, dispatch_status, sent_at)
  VALUES
    (COALESCE(_consultant_id, '00000000-0000-0000-0000-000000000000'::uuid),
     _customer_id, _media_id, COALESCE(_slot_key, 'unknown'),
     'personal', 'sent', now());

  RETURN true;
END;
$function$;
