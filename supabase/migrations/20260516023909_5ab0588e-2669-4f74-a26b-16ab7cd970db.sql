-- Garante índice único usado pelo ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_slot_dispatch_log_customer_media
  ON public.ai_slot_dispatch_log (customer_id, media_id)
  WHERE media_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.try_log_media_send(
  _consultant_id uuid,
  _customer_id uuid,
  _media_id uuid,
  _slot_key text,
  _kind text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted_id uuid;
BEGIN
  IF _customer_id IS NULL OR _media_id IS NULL THEN
    RETURN true; -- sem id não há como deduplicar
  END IF;

  INSERT INTO public.ai_slot_dispatch_log
    (consultant_id, customer_id, media_id, slot_key, variant, dispatch_status, sent_at)
  VALUES
    (COALESCE(_consultant_id, '00000000-0000-0000-0000-000000000000'::uuid),
     _customer_id, _media_id, COALESCE(_slot_key, 'unknown'),
     'personal', 'sent', now())
  ON CONFLICT (customer_id, media_id) WHERE media_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO _inserted_id;

  -- _inserted_id NULL → já existia → duplicado
  RETURN _inserted_id IS NOT NULL;
END;
$$;