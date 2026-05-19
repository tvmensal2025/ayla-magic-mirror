-- 1) Filtrar auto_feedback_on_handoff por reason (whitelist)
CREATE OR REPLACE FUNCTION public.auto_feedback_on_handoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_decision_id uuid;
  v_reason text := lower(coalesce(NEW.reason, ''));
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Whitelist: só aprendemos com handoffs que indicam falha real da IA.
  -- auto_loop_detected, manual_global_pause e outros NÃO entram no aprendizado
  -- (evita falsos negativos por silêncio do cliente, retry, ou pausa admin).
  IF v_reason NOT IN (
    'low_confidence',
    'user_requested',
    'cliente_pediu_humano',
    'faq_not_found',
    'pergunta_sem_resposta',
    'repeated_failure',
    'ai_error'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_decision_id
    FROM public.ai_decisions
   WHERE customer_id = NEW.customer_id
     AND (feedback IS NULL OR NOT (feedback ? 'rating'))
     AND created_at > now() - interval '6 hours'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_decision_id IS NOT NULL THEN
    UPDATE public.ai_decisions
       SET feedback = jsonb_build_object(
             'rating', 'down',
             'source', 'auto_handoff',
             'reason', COALESCE(NEW.reason, 'handoff_triggered'),
             'handoff_id', NEW.id,
             'at', now()
           )
     WHERE id = v_decision_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Corrigir reset_all_consultant_conversations: remover DELETE de bot_flow_rule_fires (tabela dropada)
CREATE OR REPLACE FUNCTION public.reset_all_consultant_conversations(_consultant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted jsonb := '{}'::jsonb;
  v_count int;
  v_customer_ids uuid[];
BEGIN
  IF auth.uid() IS DISTINCT FROM _consultant_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT array_agg(id) INTO v_customer_ids
  FROM customers WHERE consultant_id = _consultant_id;

  IF v_customer_ids IS NULL OR array_length(v_customer_ids,1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'note', 'no_customers', 'deleted', v_deleted);
  END IF;

  DELETE FROM conversations WHERE customer_id = ANY(v_customer_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('conversations', v_count);

  DELETE FROM ai_slot_dispatch_log WHERE customer_id = ANY(v_customer_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('ai_slot_dispatch_log', v_count);

  DELETE FROM ai_decisions WHERE customer_id = ANY(v_customer_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('ai_decisions', v_count);

  DELETE FROM ai_agent_logs WHERE customer_id = ANY(v_customer_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('ai_agent_logs', v_count);

  DELETE FROM bot_step_transitions WHERE customer_id = ANY(v_customer_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('bot_step_transitions', v_count);

  DELETE FROM bot_handoff_alerts WHERE customer_id = ANY(v_customer_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('bot_handoff_alerts', v_count);

  DELETE FROM customer_memory WHERE customer_id = ANY(v_customer_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('customer_memory', v_count);

  DELETE FROM whatsapp_message_buffer WHERE customer_id = ANY(v_customer_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('whatsapp_message_buffer', v_count);

  DELETE FROM worker_phase_logs WHERE customer_id = ANY(v_customer_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('worker_phase_logs', v_count);

  DELETE FROM facebook_capi_events WHERE customer_id = ANY(v_customer_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('facebook_capi_events', v_count);

  DELETE FROM crm_deals WHERE consultant_id = _consultant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('crm_deals', v_count);

  DELETE FROM scheduled_messages
    WHERE remote_jid IN (
      SELECT regexp_replace(coalesce(phone_whatsapp,''), '\D', '', 'g') || '@s.whatsapp.net'
      FROM customers WHERE consultant_id = _consultant_id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('scheduled_messages', v_count);

  DELETE FROM crm_auto_message_log
    WHERE remote_jid IN (
      SELECT regexp_replace(coalesce(phone_whatsapp,''), '\D', '', 'g') || '@s.whatsapp.net'
      FROM customers WHERE consultant_id = _consultant_id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('crm_auto_message_log', v_count);

  DELETE FROM customers WHERE consultant_id = _consultant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('customers', v_count);

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END;
$function$;