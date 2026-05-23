CREATE OR REPLACE FUNCTION public.seed_flow_d(_consultant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_flow_id uuid;
  v_rep text;
  v_btn_humano text;
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

  v_btn_humano := left('Falar com ' || split_part(v_rep, ' ', 1), 20);

  DELETE FROM public.bot_flows WHERE consultant_id = _consultant_id AND variant = 'D';

  INSERT INTO public.bot_flows (consultant_id, variant, name, is_active)
  VALUES (_consultant_id, 'D', 'Fluxo Whapi (botões)', true)
  RETURNING id INTO v_flow_id;

  INSERT INTO public.bot_flow_steps
    (id, flow_id, position, step_type, step_key, slot_key, title, summary, icon, message_text, is_active, transitions, captures, fallback)
  VALUES
  (v_id_welcome, v_flow_id, 1, 'message', 'd_welcome', NULL,
    'Boas-vindas com botões',
    'Apresenta a assistente e mostra 3 botões: Simular / Como funciona / Humano',
    'sparkle',
    'Olá, seja muito bem-vindo(a) 😊' || E'\n\n' ||
    'Sou a assistente virtual do ' || v_rep || ' e vou te ajudar a verificar se sua conta de luz tem perfil para economia.' || E'\n\n' ||
    'Escolha uma das opções abaixo 👇',
    true,
    jsonb_build_array(
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('simular','quero simular','1'),'goto_step_id', v_id_pedir_conta::text,'goto_special', null),
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('como','como funciona','2'),'goto_step_id', v_id_como::text,'goto_special', null),
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('humano','falar com','3'),'goto_step_id', null,'goto_special','humano')
    ),
    jsonb_build_array(
      jsonb_build_object('field','_buttons','enabled', true,'value', jsonb_build_array(
        jsonb_build_object('id','simular','title','Quero simular'),
        jsonb_build_object('id','como','title','Como funciona'),
        jsonb_build_object('id','humano','title', v_btn_humano)
      ))
    ),
    jsonb_build_object('mode','repeat')
  ),
  (v_id_pedir_conta, v_flow_id, 2, 'capture_conta', 'd_pedir_conta', NULL,
    'Pedir conta de luz',
    'Cliente envia foto; OCR extrai valor; depois mostra resultado',
    'file',
    'Perfeito! Me envia uma *foto da sua conta de luz* (pode ser o boleto ou a fatura) que eu já calculo na hora quanto você pode economizar 💚',
    true,
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object('mode','goto','goto_step_id', v_id_resultado::text)
  ),
  (v_id_como, v_flow_id, 3, 'message', 'd_como_funciona', 'como_funciona',
    'Como funciona',
    'Envia áudio+vídeo do slot como_funciona e devolve para pedir conta',
    'sparkle',
    'Vou te explicar rapidinho como funciona 👇',
    true,
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object('mode','goto','goto_step_id', v_id_pedir_conta::text)
  ),
  (v_id_resultado, v_flow_id, 4, 'message', 'd_resultado', NULL,
    'Resultado da simulação',
    'Mostra valor calculado e 3 botões: Cadastrar / Dúvidas / Humano',
    'sparkle',
    'Pronto, {{nome}}! 🎉' || E'\n\n' ||
    'Sua conta hoje é de *R$ {{valor_conta}}*.' || E'\n\n' ||
    'Você pode ter de *{{economia_range}}* de redução todos os meses — sem obra, sem instalação, continuando com a mesma distribuidora.' || E'\n\n' ||
    'Vamos cadastrar agora?',
    true,
    jsonb_build_array(
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('cadastrar','quero cadastrar','1'),'goto_step_id', v_id_pedir_doc::text,'goto_special', null),
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('duvida','dúvida','tenho duvidas','tenho dúvidas','2'),'goto_step_id', v_id_duvidas::text,'goto_special', null),
      jsonb_build_object('trigger_intent','palavra_chave','trigger_phrases', jsonb_build_array('humano','falar com','3'),'goto_step_id', null,'goto_special','humano')
    ),
    jsonb_build_array(
      jsonb_build_object('field','_buttons','enabled', true,'value', jsonb_build_array(
        jsonb_build_object('id','cadastrar','title','Cadastrar agora'),
        jsonb_build_object('id','duvida','title','Tenho dúvidas'),
        jsonb_build_object('id','humano','title', v_btn_humano)
      ))
    ),
    jsonb_build_object('mode','repeat')
  ),
  (v_id_pedir_doc, v_flow_id, 5, 'capture_documento', 'd_pedir_documento', NULL,
    'Pedir documento com foto',
    'Cliente envia RG ou CNH; ao receber vai para finalizar cadastro',
    'file',
    'Show! Pra finalizar preciso de uma foto do seu *RG (frente e verso)* ou *CNH (frente)*. Pode mandar como imagem mesmo que eu identifico sozinha 📸',
    true,
    '[]'::jsonb,
    jsonb_build_object('auto_detect_doc_type', true),
    jsonb_build_object('mode','goto','goto_step_id', v_id_final::text)
  ),
  (v_id_duvidas, v_flow_id, 6, 'message', 'd_duvidas', 'como_funciona',
    'Esclarecer dúvidas',
    'Reusa áudio+vídeo do como_funciona e volta para o Resultado',
    'sparkle',
    'Claro! Te explico de novo, é bem simples 👇',
    true,
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object('mode','goto','goto_step_id', v_id_resultado::text)
  ),
  (v_id_handoff, v_flow_id, 7, 'message', 'd_handoff', NULL,
    'Handoff para humano',
    'Acionado pelos botões "Falar com humano"; pausa o bot e avisa o consultor',
    'sparkle',
    'Beleza! Já avisei o ' || v_rep || ' aqui pra você. Em instantes ele te responde 🙌',
    false,
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object('mode','repeat')
  ),
  (v_id_final, v_flow_id, 8, 'finalizar_cadastro', 'd_finalizar', NULL,
    'Finalizar cadastro no portal',
    'Envia para o portal iGreen, dispara OTP e selfie facial',
    'sparkle',
    'Tudo certo! Estou enviando seu cadastro para o portal da iGreen ⏳' || E'\n\n' ||
    'Você vai receber um *código de verificação* aqui no WhatsApp em alguns instantes — quando chegar, *digite o código aqui mesmo* que eu finalizo a parte da selfie 📲',
    true,
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object('mode','repeat')
  );

  UPDATE public.consultants
     SET active_variants = ARRAY['D']::text[]
   WHERE id = _consultant_id;

  RETURN jsonb_build_object('flow_id', v_flow_id, 'steps', 8);
END;
$function$;

SELECT public.seed_flow_d('0c2711ad-4836-41e6-afba-edd94f698ae3'::uuid);