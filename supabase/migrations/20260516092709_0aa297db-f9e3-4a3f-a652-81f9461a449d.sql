DO $$
DECLARE
  v_ids uuid[] := ARRAY['b2fcd7ca-0c82-4644-be9e-3abe3cf5d308'::uuid,'06a07311-6a57-4c2b-8e53-85a4daf9b1a8'::uuid];
  v_id uuid;
BEGIN
  FOREACH v_id IN ARRAY v_ids LOOP
    DELETE FROM conversations WHERE customer_id = v_id;
    DELETE FROM ai_slot_dispatch_log WHERE customer_id = v_id;
    DELETE FROM ai_decisions WHERE customer_id = v_id;
    DELETE FROM ai_agent_logs WHERE customer_id = v_id;
    DELETE FROM bot_step_transitions WHERE customer_id = v_id;
    DELETE FROM bot_flow_rule_fires WHERE customer_id = v_id;
    DELETE FROM bot_handoff_alerts WHERE customer_id = v_id;
    DELETE FROM customer_memory WHERE customer_id = v_id;
    DELETE FROM whatsapp_message_buffer WHERE customer_id = v_id;
    DELETE FROM worker_phase_logs WHERE customer_id = v_id;
    DELETE FROM facebook_capi_events WHERE customer_id = v_id;
    UPDATE crm_deals SET stage='novo_lead', approved_at=NULL, rejected_at=NULL, rejection_reason=NULL, updated_at=now() WHERE customer_id = v_id;
    UPDATE customers SET
      chat_cleared_at = now(), status = 'pending', updated_at = now(),
      conversation_step = NULL, previous_conversation_step = NULL,
      last_rule_id = NULL, last_rule_fire_at = NULL,
      conversation_summary = NULL, summary_updated_at = NULL,
      sales_phase = NULL, qualification_score = NULL, intent_signals = NULL,
      pain_point = NULL, next_followup_at = NULL, last_followup_at = NULL,
      followup_count = 0, last_bot_reply_at = NULL, last_bot_interaction_at = NULL,
      bot_paused = false, bot_paused_reason = NULL, bot_paused_at = NULL, bot_paused_until = NULL,
      assigned_human_id = NULL, error_message = NULL, conversational_flow_enabled = NULL,
      ocr_done = false, ocr_conta_attempts = 0, ocr_doc_attempts = 0,
      rescue_attempts = 0, last_rescue_at = NULL, ai_rescue_count = 0,
      ai_last_rescue_at = NULL, next_rescue_allowed_at = NULL,
      bill_requested_at = NULL, phone_contact_confirmed = false
    WHERE id = v_id;
  END LOOP;
  DELETE FROM scheduled_messages WHERE remote_jid IN ('5511971254913@s.whatsapp.net','5511989000650@s.whatsapp.net');
  DELETE FROM crm_auto_message_log WHERE remote_jid IN ('5511971254913@s.whatsapp.net','5511989000650@s.whatsapp.net');
END $$;