DO $$
DECLARE
  v_consultant uuid := '0c2711ad-4836-41e6-afba-edd94f698ae3';
  v_phones text[] := ARRAY['5511971254913','5511989000650'];
  v_phone text;
  v_cust uuid;
  v_jid text;
BEGIN
  FOREACH v_phone IN ARRAY v_phones LOOP
    v_jid := v_phone || '@s.whatsapp.net';
    SELECT id INTO v_cust FROM customers
      WHERE consultant_id = v_consultant AND phone_whatsapp = v_phone LIMIT 1;
    IF v_cust IS NOT NULL THEN
      DELETE FROM conversations WHERE customer_id = v_cust;
      DELETE FROM ai_slot_dispatch_log WHERE customer_id = v_cust;
      DELETE FROM bot_step_transitions WHERE customer_id = v_cust;
      UPDATE customers SET
        conversation_step = NULL, conversation_summary = NULL, summary_updated_at = NULL,
        sales_phase = NULL, qualification_score = NULL, intent_signals = NULL,
        pain_point = NULL, next_followup_at = NULL, last_bot_reply_at = NULL,
        bot_paused = false, bot_paused_reason = NULL, bot_paused_at = NULL, error_message = NULL,
        conversational_flow_enabled = NULL,
        name = NULL, name_source = 'unknown',
        cpf = NULL, rg = NULL, data_nascimento = NULL, nome_pai = NULL, nome_mae = NULL,
        email = NULL, phone_landline = NULL, phone_contact_confirmed = false,
        cep = NULL, address_street = NULL, address_number = NULL, address_complement = NULL,
        address_neighborhood = NULL, address_city = NULL, address_state = NULL,
        electricity_bill_value = NULL, electricity_bill_photo_url = NULL,
        bill_base64 = NULL, bill_message_id = NULL, bill_requested_at = NULL,
        distribuidora = NULL, numero_instalacao = NULL,
        document_front_url = NULL, document_back_url = NULL,
        document_front_base64 = NULL, document_type = NULL,
        ocr_done = false, ocr_confianca = NULL, ocr_conta_attempts = 0, ocr_doc_attempts = 0,
        rescue_attempts = 0, last_rescue_at = NULL, ai_rescue_count = 0,
        ai_last_rescue_at = NULL, next_rescue_allowed_at = NULL
      WHERE id = v_cust;
    END IF;
    DELETE FROM scheduled_messages WHERE remote_jid = v_jid;
    DELETE FROM crm_auto_message_log WHERE remote_jid = v_jid;
  END LOOP;
END $$;