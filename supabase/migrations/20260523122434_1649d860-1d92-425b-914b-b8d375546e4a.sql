
CREATE OR REPLACE FUNCTION public.seed_flow_d(_consultant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flow_id uuid;
  v_rep text;
  v_welcome_text text;
  v_pedir_conta_text text;
  v_como_text text;
  v_resultado_text text;
  v_pedir_doc_text text;
  v_duvidas_text text;
  v_handoff_text text;
  v_final_text text;
  v_id_welcome uuid := gen_random_uuid();
  v_id_pedir_conta uuid := gen_random_uuid();
  v_id_como uuid := gen_random_uuid();
  v_id_resultado uuid := gen_random_uuid();
  v_id_pedir_doc uuid := gen_random_uuid();
  v_id_duvidas uuid := gen_random_uuid();
  v_id_handoff uuid := gen_random_uuid();
  v_id_final uuid := gen_random_uuid();
BEGIN
  IF _consultant_id IS NULL THEN
    RAISE EXCEPTION 'consultant_id é obrigatório';
  END IF;

  SELECT COALESCE(NULLIF(name, ''), 'nosso time') INTO v_rep
  FROM public.consultants WHERE id = _consultant_id;

  -- 1) Remove flow D existente (cascade apaga steps)
  DELETE FROM public.bot_flows WHERE consultant_id = _consultant_id AND variant = 'D';

  -- 2) Cria flow D
  INSERT INTO public.bot_flows (consultant_id, variant, name, is_active)
  VALUES (_consultant_id, 'D', 'Fluxo Whapi (botões)', true)
  RETURNING id INTO v_flow_id;

  -- Textos
  v_welcome_text := 'Olá, seja muito bem-vindo(a) 😊' || E'\n\n' ||
    'Sou a assistente virtual do ' || v_rep || ' e vou te ajudar a verificar se sua conta de luz tem perfil para economia.' || E'\n\n' ||
    'Escolha uma opção:';

  v_pedir_conta_text := 'Perfeito! Me envia uma *foto da sua conta de luz* que eu já calculo quanto você pode economizar 💚';

  v_como_text := 'Vou te explicar rapidinho como funciona 👇';

  v_resultado_text := 'Pronto, {{nome}}! 🎉' || E'\n\n' ||
    'Sua conta hoje é de *R$ {{valor_conta}}*.' || E'\n\n' ||
    'Você pode ter de *{{economia_range}}* de redução todo mês — sem obra, sem instalação, continuando com a mesma distribuidora.' || E'\n\n' ||
    'Bora cadastrar agora?';

  v_pedir_doc_text := 'Show! Pra finalizar preciso de uma foto do seu *RG (frente + verso)* ou *CNH (frente)*. ' ||
    'A IA detecta sozinha qual é 📸';

  v_duvidas_text := 'Claro! Te explico de novo 👇';

  v_handoff_text := 'Beleza! Já chamei o ' || v_rep || ' aqui pra você. Em instantes ele te responde 🙌';

  v_final_text := 'Tudo certo! Estou enviando seu cadastro para o portal da iGreen ⏳' || E'\n\n' ||
    'Você vai receber um *código de verificação* aqui no WhatsApp em alguns instantes — quando chegar, *digite o código aqui mesmo*.';

  -- 3) Insere os 8 passos
  INSERT INTO public.bot_flow_steps
    (id, flow_id, position, step_type, step_key, slot_key, title, summary, icon, message_text, is_active, transitions, captures, fallback)
  VALUES
  -- 1: welcome com botões
  (v_id_welcome, v_flow_id, 1, 'message', 'd_welcome', NULL,
    'Boas-vindas com botões', 'Apresenta a Camila e mostra 3 botões', 'sparkle',
    v_welcome_text, true,
    jsonb_build_array(
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('simular'),'goto_step_id', v_id_pedir_conta::text,'goto_special', null),
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('como'),'goto_step_id', v_id_como::text,'goto_special', null),
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('humano'),'goto_step_id', null,'goto_special','humano')
    ),
    jsonb_build_array(
      jsonb_build_object('field','_buttons','enabled', true,'value', jsonb_build_array(
        jsonb_build_object('id','simular','title','Quero simular'),
        jsonb_build_object('id','como','title','Como funciona'),
        jsonb_build_object('id','humano','title','Falar com ' || left(v_rep, 8))
      ))
    ),
    jsonb_build_object('mode','repeat')
  ),
  -- 2: captura conta
  (v_id_pedir_conta, v_flow_id, 2, 'capture_conta', 'd_pedir_conta', NULL,
    'Pedir conta de luz', 'Cliente envia foto; OCR extrai valor e dados', 'file',
    v_pedir_conta_text, true,
    jsonb_build_array(
      jsonb_build_object('trigger_intent','default','trigger_phrases', '[]'::jsonb,'goto_step_id', v_id_resultado::text,'goto_special', null)
    ),
    '[]'::jsonb,
    jsonb_build_object('mode','repeat')
  ),
  -- 3: como funciona (reusa slot do Fluxo A "como_funciona" — herda áudio+vídeo)
  (v_id_como, v_flow_id, 3, 'message', 'd_como_funciona', 'como_funciona',
    'Como funciona (áudio + vídeo)', 'Reaproveita as mídias do passo 6 do Fluxo A', 'video',
    v_como_text, true,
    jsonb_build_array(
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('simular'),'goto_step_id', v_id_pedir_conta::text,'goto_special', null),
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('humano'),'goto_step_id', null,'goto_special','humano')
    ),
    jsonb_build_array(
      jsonb_build_object('field','_buttons','enabled', true,'value', jsonb_build_array(
        jsonb_build_object('id','simular','title','Quero simular'),
        jsonb_build_object('id','humano','title','Falar com ' || left(v_rep, 8))
      ))
    ),
    jsonb_build_object('mode','repeat')
  ),
  -- 4: resultado da simulação
  (v_id_resultado, v_flow_id, 4, 'message', 'd_resultado', NULL,
    'Resultado da simulação', 'Mostra economia 8–20% e oferece 3 caminhos', 'sparkle',
    v_resultado_text, true,
    jsonb_build_array(
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('cadastrar'),'goto_step_id', v_id_pedir_doc::text,'goto_special', null),
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('duvidas'),'goto_step_id', v_id_duvidas::text,'goto_special', null),
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('humano'),'goto_step_id', null,'goto_special','humano')
    ),
    jsonb_build_array(
      jsonb_build_object('field','_buttons','enabled', true,'value', jsonb_build_array(
        jsonb_build_object('id','cadastrar','title','Cadastrar agora'),
        jsonb_build_object('id','duvidas','title','Tenho mais dúvidas'),
        jsonb_build_object('id','humano','title','Falar com ' || left(v_rep, 8))
      ))
    ),
    jsonb_build_object('mode','repeat')
  ),
  -- 5: captura documento (RG/CNH) — reusa slot do Fluxo A para herdar prompts
  (v_id_pedir_doc, v_flow_id, 5, 'capture_documento', 'd_pedir_documento', 'passo_mp74oztd',
    'Pedir documento (RG/CNH)', 'IA detecta o tipo automaticamente', 'file',
    v_pedir_doc_text, true,
    jsonb_build_array(
      jsonb_build_object('trigger_intent','default','trigger_phrases', '[]'::jsonb,'goto_step_id', v_id_final::text,'goto_special', null)
    ),
    '[]'::jsonb,
    jsonb_build_object('mode','repeat')
  ),
  -- 6: dúvidas (reusa como_funciona) com botões
  (v_id_duvidas, v_flow_id, 6, 'message', 'd_duvidas', 'como_funciona',
    'Tirar dúvidas', 'Reenvia material explicativo + botões', 'msg',
    v_duvidas_text, true,
    jsonb_build_array(
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('simular'),'goto_step_id', v_id_pedir_conta::text,'goto_special', null),
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('cadastrar'),'goto_step_id', v_id_pedir_doc::text,'goto_special', null),
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('humano'),'goto_step_id', null,'goto_special','humano')
    ),
    jsonb_build_array(
      jsonb_build_object('field','_buttons','enabled', true,'value', jsonb_build_array(
        jsonb_build_object('id','simular','title','Quero simular'),
        jsonb_build_object('id','cadastrar','title','Já quero cadastrar'),
        jsonb_build_object('id','humano','title','Falar com ' || left(v_rep, 8))
      ))
    ),
    jsonb_build_object('mode','repeat')
  ),
  -- 7: handoff (apenas referenciado por goto_special='humano' — não fica na cadeia)
  (v_id_handoff, v_flow_id, 7, 'message', 'd_handoff', NULL,
    'Handoff para humano', 'Pausa o bot e notifica o consultor', 'user',
    v_handoff_text, false,  -- inativo, é alcançado via goto_special
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object('mode','repeat')
  ),
  -- 8: finalizar cadastro (dispara portal + OTP + selfie automaticamente)
  (v_id_final, v_flow_id, 8, 'finalizar_cadastro', 'd_finalizar', NULL,
    'Finalizar cadastro', 'Envia ao portal, OTP e selfie', 'file',
    v_final_text, true,
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object('mode','repeat')
  );

  -- 4) D vira único ativo no round-robin
  UPDATE public.consultants
    SET active_variants = ARRAY['D']::text[],
        updated_at = now()
  WHERE id = _consultant_id;

  -- 5) Garante que os demais flows do consultor continuem existindo mas saiam do sorteio
  --    (active_variants já bloqueia; não desativamos is_active dos demais para não perder histórico)

  RETURN jsonb_build_object(
    'ok', true,
    'flow_id', v_flow_id,
    'steps_created', 8,
    'active_variants', ARRAY['D']
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_flow_d(uuid) TO authenticated;
