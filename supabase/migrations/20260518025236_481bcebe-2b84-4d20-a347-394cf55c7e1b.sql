
-- Remove o passo "Quebra de objeção" vazio
DELETE FROM bot_flow_steps WHERE step_key = 'passo_mpa3yr6a' AND (message_text IS NULL OR message_text = '');

-- Função idempotente para inserir um atalho (QA + triggers) num fluxo
-- Pula se o intent_name já existe nesse flow_id
CREATE OR REPLACE FUNCTION public.seed_objection_shortcut(
  _flow_id uuid,
  _intent_name text,
  _text_response text,
  _triggers text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _qa_id uuid;
  _next_pos int;
  _phrase text;
BEGIN
  -- Verifica se já existe
  SELECT id INTO _qa_id FROM bot_flow_qa
  WHERE flow_id = _flow_id AND intent_name = _intent_name
  LIMIT 1;

  IF _qa_id IS NOT NULL THEN
    RETURN _qa_id;
  END IF;

  -- Pega próxima posição
  SELECT COALESCE(MAX(position), -1) + 1 INTO _next_pos
  FROM bot_flow_qa WHERE flow_id = _flow_id;

  -- Insere QA
  INSERT INTO bot_flow_qa (flow_id, position, intent_name, is_opening, is_closing, text_response)
  VALUES (_flow_id, _next_pos, _intent_name, false, false, NULLIF(_text_response, ''))
  RETURNING id INTO _qa_id;

  -- Insere triggers
  FOREACH _phrase IN ARRAY _triggers LOOP
    IF length(trim(_phrase)) > 0 THEN
      INSERT INTO bot_flow_qa_triggers (qa_id, phrase) VALUES (_qa_id, trim(_phrase));
    END IF;
  END LOOP;

  RETURN _qa_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_objection_shortcut(uuid, text, text, text[]) TO authenticated;
