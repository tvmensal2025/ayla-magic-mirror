-- Função SECURITY DEFINER para zerar 100% da conversa e memória de um lead
-- Garante que nenhuma RLS impeça a limpeza completa.

CREATE OR REPLACE FUNCTION public.reset_lead_conversation(
  _consultant_id uuid,
  _customer_id uuid DEFAULT NULL,
  _remote_jid text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid := _customer_id;
  v_phone text;
  v_deleted jsonb := '{}'::jsonb;
  v_count int;
BEGIN
  -- Apenas o próprio consultor (ou admin) pode resetar seus leads
  IF auth.uid() IS DISTINCT FROM _consultant_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF v_customer_id IS NULL AND _remote_jid IS NOT NULL THEN
    v_phone := split_part(_remote_jid, '@', 1);
    SELECT id INTO v_customer_id
    FROM customers
    WHERE consultant_id = _consultant_id
      AND phone_whatsapp = v_phone
    LIMIT 1;
  END IF;

  IF v_customer_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'customer_id', null, 'note', 'no_customer');
  END IF;

  DELETE FROM conversations WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('conversations', v_count);

  DELETE FROM ai_slot_dispatch_log WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('ai_slot_dispatch_log', v_count);

  DELETE FROM ai_decisions WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('ai_decisions', v_count);

  DELETE FROM ai_agent_logs WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('ai_agent_logs', v_count);

  DELETE FROM bot_step_transitions WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('bot_step_transitions', v_count);

  DELETE FROM customer_memory WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('customer_memory', v_count);

  DELETE FROM ai_usage_log WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('ai_usage_log', v_count);

  DELETE FROM worker_phase_logs WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('worker_phase_logs', v_count);

  IF _remote_jid IS NOT NULL THEN
    DELETE FROM scheduled_messages WHERE remote_jid = _remote_jid;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('scheduled_messages', v_count);

    DELETE FROM crm_auto_message_log WHERE remote_jid = _remote_jid;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('crm_auto_message_log', v_count);

    DELETE FROM customer_tags WHERE remote_jid = _remote_jid;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('customer_tags', v_count);
  END IF;

  UPDATE customers SET
    name = NULL, name_source = 'unknown', cpf = NULL, rg = NULL,
    data_nascimento = NULL, email = NULL, cep = NULL,
    address_street = NULL, address_number = NULL, address_complement = NULL,
    address_neighborhood = NULL, address_city = NULL, address_state = NULL,
    distribuidora = NULL, numero_instalacao = NULL,
    electricity_bill_value = NULL, electricity_bill_photo_url = NULL,
    bill_base64 = NULL, bill_message_id = NULL, bill_requested_at = NULL,
    document_front_url = NULL, document_back_url = NULL,
    document_front_base64 = NULL, document_type = NULL,
    media_message_id = NULL, conversation_step = NULL,
    conversation_summary = NULL, summary_updated_at = NULL,
    sales_phase = NULL, qualification_score = NULL,
    intent_signals = NULL, pain_point = NULL, next_followup_at = NULL,
    ocr_done = false, ocr_conta_attempts = 0, ocr_doc_attempts = 0,
    ocr_confianca = NULL, rescue_attempts = 0, last_rescue_at = NULL,
    ai_rescue_count = 0, ai_last_rescue_at = NULL,
    next_rescue_allowed_at = NULL, last_bot_reply_at = NULL,
    phone_contact_confirmed = false, facial_confirmed_at = NULL,
    link_facial = NULL, portal_submitted_at = NULL,
    otp_code = NULL, otp_received_at = NULL, error_message = NULL,
    bot_paused = false, bot_paused_reason = NULL, bot_paused_at = NULL,
    assigned_human_id = NULL, status = 'pending'
  WHERE id = v_customer_id;

  RETURN jsonb_build_object('ok', true, 'customer_id', v_customer_id, 'deleted', v_deleted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_lead_conversation(uuid, uuid, text) TO authenticated;