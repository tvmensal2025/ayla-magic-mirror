-- 1. Feedback e rastreio de mídia nas decisões da IA
ALTER TABLE public.ai_decisions ADD COLUMN IF NOT EXISTS feedback jsonb;
ALTER TABLE public.ai_decisions ADD COLUMN IF NOT EXISTS media_sent_id uuid;

-- 2. Índices GIN para busca por tags
CREATE INDEX IF NOT EXISTS idx_ai_media_step_tags ON public.ai_media_library USING gin(step_tags);
CREATE INDEX IF NOT EXISTS idx_ai_media_intent_tags ON public.ai_media_library USING gin(intent_tags);
CREATE INDEX IF NOT EXISTS idx_ai_media_active_public ON public.ai_media_library(active, is_public) WHERE active = true;

-- 3. Função para fork de mídia pública -> biblioteca do consultor
CREATE OR REPLACE FUNCTION public.fork_public_ai_media(_media_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_id uuid;
  _user uuid := auth.uid();
  _existing uuid;
  _src record;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  -- Verifica se a mídia origem é pública
  SELECT * INTO _src FROM public.ai_media_library
   WHERE id = _media_id AND is_public = true AND active = true;
  IF _src IS NULL THEN RAISE EXCEPTION 'Mídia pública não encontrada'; END IF;

  -- Se já existe cópia desse usuário com mesmo label, retorna ela (idempotência leve)
  SELECT id INTO _existing FROM public.ai_media_library
   WHERE consultant_id = _user AND label = _src.label AND kind = _src.kind
   LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  INSERT INTO public.ai_media_library
    (consultant_id, kind, label, url, storage_path, text_content, transcript,
     duration_sec, step_tags, intent_tags, priority, is_public, active)
  VALUES
    (_user, _src.kind, _src.label, _src.url, _src.storage_path, _src.text_content,
     _src.transcript, _src.duration_sec, _src.step_tags, _src.intent_tags,
     _src.priority, false, true)
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;