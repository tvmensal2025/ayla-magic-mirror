-- Garante que a mesma mídia (áudio/vídeo) não seja enviada duas vezes para o mesmo cliente
CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_slot_dispatch_log_customer_media
  ON public.ai_slot_dispatch_log (customer_id, media_id)
  WHERE media_id IS NOT NULL;

-- Helper para checar/registrar envio único de mídia por cliente
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
  _exists boolean;
BEGIN
  IF _customer_id IS NULL OR _media_id IS NULL THEN
    RETURN true; -- sem id, não conseguimos deduplicar; deixa passar
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.ai_slot_dispatch_log
     WHERE customer_id = _customer_id AND media_id = _media_id
  ) INTO _exists;
  IF _exists THEN RETURN false; END IF;
  INSERT INTO public.ai_slot_dispatch_log
    (consultant_id, customer_id, media_id, slot_key, dispatch_status, sent_at)
  VALUES
    (_consultant_id, _customer_id, _media_id, _slot_key, 'sent', now())
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;