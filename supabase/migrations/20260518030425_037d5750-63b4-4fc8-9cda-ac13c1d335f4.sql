CREATE OR REPLACE FUNCTION public.repair_bot_flow(_flow_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_step RECORD;
  v_next_step RECORD;
  v_patched int := 0;
  v_details jsonb := '[]'::jsonb;
  v_new_captures jsonb;
  v_new_transitions jsonb;
  v_new_fallback jsonb;
  v_needs_capture boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.bot_flows f
    WHERE f.id = _flow_id
      AND (f.consultant_id = auth.uid() OR public.is_super_admin(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  FOR v_step IN
    SELECT * FROM public.bot_flow_steps
     WHERE flow_id = _flow_id ORDER BY position ASC
  LOOP
    v_new_captures := v_step.captures;
    v_new_transitions := v_step.transitions;
    v_new_fallback := v_step.fallback;

    SELECT id, position INTO v_next_step
      FROM public.bot_flow_steps
     WHERE flow_id = _flow_id AND position > v_step.position
     ORDER BY position ASC LIMIT 1;

    v_needs_capture := (v_step.captures IS NULL OR jsonb_array_length(v_step.captures) = 0);

    -- ============== QUESTION =====================
    IF v_step.step_type = 'question' AND v_needs_capture THEN
      IF v_step.position = 2 OR v_step.step_key ILIKE '%qualif%' THEN
        v_new_captures := jsonb_build_array(jsonb_build_object(
          'name','valor_conta','kind','currency',
          'regex','(?:r\$\s*)?\d{2,5}(?:[.,]\d{1,2})?',
          'required',true,
          'retry_text','Pode me mandar só o valor médio da sua conta de luz? Tipo "300", "450"... 😊'
        ));
      ELSE
        v_new_captures := jsonb_build_array(jsonb_build_object(
          'name','resposta_texto','kind','text','required',true
        ));
      END IF;
      IF (v_step.transitions IS NULL OR jsonb_array_length(v_step.transitions) = 0) AND v_next_step.id IS NOT NULL THEN
        v_new_transitions := jsonb_build_array(jsonb_build_object(
          'trigger_intent','default','trigger_phrases','[]'::jsonb,
          'goto_step_id', v_next_step.id, 'goto_special', null));
      END IF;
      v_new_fallback := jsonb_build_object('mode','retry','max_retries',2,'on_fail','handoff','handoff_reason','step_misconfigured_or_lead_off_topic');

    -- ============== MEDIA_REQUEST / CAPTURE_CONTA / CAPTURE_DOCUMENTO ====
    ELSIF v_step.step_type IN ('media_request','capture_conta','capture_documento') AND v_needs_capture THEN
      IF v_step.step_type = 'capture_conta' OR v_step.position = 6 OR v_step.step_key ILIKE '%conta%' THEN
        v_new_captures := jsonb_build_array(jsonb_build_object(
          'name','imagem_conta','kind','media',
          'accepts', jsonb_build_array('image','document'),
          'required',true,
          'retry_text','Me manda a foto ou PDF da sua conta de luz mesmo, por aqui pelo WhatsApp 📄😊'
        ));
      ELSE
        v_new_captures := jsonb_build_array(jsonb_build_object(
          'name','documento_cliente','kind','media',
          'accepts', jsonb_build_array('image','document'),
          'required',true,
          'retry_text','Pode me enviar uma foto do seu documento (RG, CNH ou selfie)? 📷'
        ));
      END IF;
      IF (v_step.transitions IS NULL OR jsonb_array_length(v_step.transitions) = 0) AND v_next_step.id IS NOT NULL THEN
        v_new_transitions := jsonb_build_array(jsonb_build_object(
          'trigger_intent','media_received','trigger_phrases','[]'::jsonb,
          'goto_step_id', v_next_step.id, 'goto_special', null));
      END IF;
      v_new_fallback := jsonb_build_object('mode','retry','max_retries',2,'on_fail','handoff','handoff_reason','no_media_received');

    -- ============== CADASTRO / FINALIZAR_CADASTRO ===========
    ELSIF v_step.step_type IN ('cadastro','finalizar_cadastro') AND v_needs_capture THEN
      v_new_captures := jsonb_build_array(jsonb_build_object(
        'name','cadastro_completo','kind','system',
        'pipeline', CASE WHEN v_step.step_type='finalizar_cadastro' THEN 'finalizar_cadastro' ELSE 'cadastro_portal' END,
        'required',true
      ));
      v_new_fallback := jsonb_build_object('mode','handoff','handoff_reason','cadastro_falhou');

    -- ============== MESSAGE que termina com "?" (pergunta implícita) =====
    ELSIF v_step.step_type = 'message'
          AND v_needs_capture
          AND v_step.message_text IS NOT NULL
          AND v_step.message_text ~ '\?\s*$' THEN
      v_new_captures := jsonb_build_array(jsonb_build_object(
        'name','resposta_texto','kind','text','required',false
      ));
      IF (v_step.transitions IS NULL OR jsonb_array_length(v_step.transitions) = 0) AND v_next_step.id IS NOT NULL THEN
        v_new_transitions := jsonb_build_array(jsonb_build_object(
          'trigger_intent','default','trigger_phrases','[]'::jsonb,
          'goto_step_id', v_next_step.id, 'goto_special', null));
      END IF;
      v_new_fallback := jsonb_build_object('mode','advance','on_fail','next');

    -- ============== MESSAGE sem transição e tem próximo ============
    ELSIF v_step.step_type = 'message'
          AND (v_step.transitions IS NULL OR jsonb_array_length(v_step.transitions) = 0)
          AND v_next_step.id IS NOT NULL THEN
      v_new_transitions := jsonb_build_array(jsonb_build_object(
        'trigger_intent','default','trigger_phrases','[]'::jsonb,
        'goto_step_id', v_next_step.id, 'goto_special', null));

    ELSE
      CONTINUE;
    END IF;

    UPDATE public.bot_flow_steps
       SET captures = v_new_captures,
           transitions = v_new_transitions,
           fallback = v_new_fallback,
           updated_at = now()
     WHERE id = v_step.id;

    v_patched := v_patched + 1;
    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'step_id', v_step.id, 'position', v_step.position, 'step_type', v_step.step_type));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'patched', v_patched, 'details', v_details);
END;
$$;

-- Back-fill imediato em todos os fluxos ativos com a nova lógica
DO $$
DECLARE
  v_flow RECORD;
  v_step RECORD;
  v_next_step RECORD;
  v_new_captures jsonb;
  v_new_transitions jsonb;
  v_new_fallback jsonb;
  v_needs_capture boolean;
BEGIN
  FOR v_flow IN SELECT id FROM public.bot_flows WHERE is_active = true LOOP
    FOR v_step IN SELECT * FROM public.bot_flow_steps WHERE flow_id = v_flow.id ORDER BY position ASC
    LOOP
      v_new_captures := v_step.captures;
      v_new_transitions := v_step.transitions;
      v_new_fallback := v_step.fallback;
      v_needs_capture := (v_step.captures IS NULL OR jsonb_array_length(v_step.captures) = 0);

      SELECT id, position INTO v_next_step FROM public.bot_flow_steps
       WHERE flow_id = v_flow.id AND position > v_step.position
       ORDER BY position ASC LIMIT 1;

      IF v_step.step_type IN ('media_request','capture_conta','capture_documento') AND v_needs_capture THEN
        IF v_step.step_type = 'capture_conta' OR v_step.step_key ILIKE '%conta%' THEN
          v_new_captures := jsonb_build_array(jsonb_build_object(
            'name','imagem_conta','kind','media',
            'accepts', jsonb_build_array('image','document'),'required',true,
            'retry_text','Me manda a foto ou PDF da sua conta de luz mesmo, por aqui pelo WhatsApp 📄😊'));
        ELSE
          v_new_captures := jsonb_build_array(jsonb_build_object(
            'name','documento_cliente','kind','media',
            'accepts', jsonb_build_array('image','document'),'required',true,
            'retry_text','Pode me enviar uma foto do seu documento (RG, CNH ou selfie)? 📷'));
        END IF;
        IF (v_step.transitions IS NULL OR jsonb_array_length(v_step.transitions) = 0) AND v_next_step.id IS NOT NULL THEN
          v_new_transitions := jsonb_build_array(jsonb_build_object(
            'trigger_intent','media_received','trigger_phrases','[]'::jsonb,
            'goto_step_id', v_next_step.id,'goto_special',null));
        END IF;
        v_new_fallback := jsonb_build_object('mode','retry','max_retries',2,'on_fail','handoff','handoff_reason','no_media_received');

      ELSIF v_step.step_type IN ('cadastro','finalizar_cadastro') AND v_needs_capture THEN
        v_new_captures := jsonb_build_array(jsonb_build_object(
          'name','cadastro_completo','kind','system',
          'pipeline', CASE WHEN v_step.step_type='finalizar_cadastro' THEN 'finalizar_cadastro' ELSE 'cadastro_portal' END,
          'required',true));
        v_new_fallback := jsonb_build_object('mode','handoff','handoff_reason','cadastro_falhou');

      ELSIF v_step.step_type = 'message' AND v_needs_capture
            AND v_step.message_text IS NOT NULL AND v_step.message_text ~ '\?\s*$' THEN
        v_new_captures := jsonb_build_array(jsonb_build_object(
          'name','resposta_texto','kind','text','required',false));
        IF (v_step.transitions IS NULL OR jsonb_array_length(v_step.transitions) = 0) AND v_next_step.id IS NOT NULL THEN
          v_new_transitions := jsonb_build_array(jsonb_build_object(
            'trigger_intent','default','trigger_phrases','[]'::jsonb,
            'goto_step_id', v_next_step.id,'goto_special',null));
        END IF;
        v_new_fallback := jsonb_build_object('mode','advance','on_fail','next');

      ELSIF v_step.step_type = 'message'
            AND (v_step.transitions IS NULL OR jsonb_array_length(v_step.transitions) = 0)
            AND v_next_step.id IS NOT NULL THEN
        v_new_transitions := jsonb_build_array(jsonb_build_object(
          'trigger_intent','default','trigger_phrases','[]'::jsonb,
          'goto_step_id', v_next_step.id,'goto_special',null));
      ELSE
        CONTINUE;
      END IF;

      UPDATE public.bot_flow_steps
         SET captures = v_new_captures, transitions = v_new_transitions,
             fallback = v_new_fallback, updated_at = now()
       WHERE id = v_step.id;
    END LOOP;
  END LOOP;
END $$;