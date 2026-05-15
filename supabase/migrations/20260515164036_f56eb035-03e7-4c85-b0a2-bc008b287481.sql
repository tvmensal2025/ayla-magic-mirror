
CREATE OR REPLACE FUNCTION public.reset_lead_conversation(_consultant_id uuid, _customer_id uuid DEFAULT NULL::uuid, _remote_jid text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_id uuid := _customer_id;
  v_phone text;
  v_deleted jsonb := '{}'::jsonb;
  v_count int;
BEGIN
  IF auth.uid() IS DISTINCT FROM _consultant_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF v_customer_id IS NULL AND _remote_jid IS NOT NULL THEN
    v_phone := split_part(_remote_jid, '@', 1);
    SELECT id INTO v_customer_id FROM customers
     WHERE consultant_id = _consultant_id AND phone_whatsapp = v_phone LIMIT 1;
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

  DELETE FROM bot_step_transitions WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('bot_step_transitions', v_count);

  IF _remote_jid IS NOT NULL THEN
    DELETE FROM scheduled_messages WHERE remote_jid = _remote_jid;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('scheduled_messages', v_count);

    DELETE FROM crm_auto_message_log WHERE remote_jid = _remote_jid;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('crm_auto_message_log', v_count);
  END IF;

  -- Limpa TUDO do lead para começar do zero (welcome)
  UPDATE customers SET
    -- estado conversacional
    conversation_step = NULL,
    conversation_summary = NULL,
    summary_updated_at = NULL,
    sales_phase = NULL,
    qualification_score = NULL,
    intent_signals = NULL,
    pain_point = NULL,
    next_followup_at = NULL,
    last_bot_reply_at = NULL,
    bot_paused = false,
    bot_paused_reason = NULL,
    bot_paused_at = NULL,
    error_message = NULL,
    -- identidade / OCR
    name = NULL,
    name_source = 'unknown',
    cpf = NULL,
    rg = NULL,
    data_nascimento = NULL,
    nome_pai = NULL,
    nome_mae = NULL,
    email = NULL,
    phone_landline = NULL,
    phone_contact_confirmed = false,
    -- endereço
    cep = NULL,
    address_street = NULL,
    address_number = NULL,
    address_complement = NULL,
    address_neighborhood = NULL,
    address_city = NULL,
    address_state = NULL,
    -- conta de luz
    electricity_bill_value = NULL,
    electricity_bill_photo_url = NULL,
    bill_base64 = NULL,
    bill_message_id = NULL,
    bill_requested_at = NULL,
    distribuidora = NULL,
    numero_instalacao = NULL,
    -- documentos
    document_front_url = NULL,
    document_back_url = NULL,
    document_front_base64 = NULL,
    document_type = NULL,
    -- contadores OCR / rescue
    ocr_done = false,
    ocr_confianca = NULL,
    ocr_conta_attempts = 0,
    ocr_doc_attempts = 0,
    rescue_attempts = 0,
    last_rescue_at = NULL,
    ai_rescue_count = 0,
    ai_last_rescue_at = NULL,
    next_rescue_allowed_at = NULL
  WHERE id = v_customer_id;

  RETURN jsonb_build_object('ok', true, 'customer_id', v_customer_id, 'deleted', v_deleted);
END;
$function$;
