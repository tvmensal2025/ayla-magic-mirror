DO $$
DECLARE
  v_phones text[] := ARRAY['5511971254913','5511989000650'];
  v_remote_jids text[] := ARRAY['5511971254913@s.whatsapp.net','5511989000650@s.whatsapp.net'];
  v_ids uuid[];
BEGIN
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO v_ids
  FROM public.customers
  WHERE regexp_replace(coalesce(phone_whatsapp, ''), '\D', '', 'g') = ANY(v_phones);

  DELETE FROM public.conversations WHERE customer_id = ANY(v_ids);
  DELETE FROM public.ai_slot_dispatch_log WHERE customer_id = ANY(v_ids);
  DELETE FROM public.ai_decisions WHERE customer_id = ANY(v_ids);
  DELETE FROM public.ai_agent_logs WHERE customer_id = ANY(v_ids);
  DELETE FROM public.bot_step_transitions WHERE customer_id = ANY(v_ids);
  DELETE FROM public.bot_flow_rule_fires WHERE customer_id = ANY(v_ids);
  DELETE FROM public.bot_handoff_alerts WHERE customer_id = ANY(v_ids);
  DELETE FROM public.customer_memory WHERE customer_id = ANY(v_ids);
  DELETE FROM public.whatsapp_message_buffer WHERE customer_id = ANY(v_ids);
  DELETE FROM public.worker_phase_logs WHERE customer_id = ANY(v_ids);
  DELETE FROM public.facebook_capi_events WHERE customer_id = ANY(v_ids);
  DELETE FROM public.scheduled_messages WHERE remote_jid = ANY(v_remote_jids);
  DELETE FROM public.crm_auto_message_log WHERE remote_jid = ANY(v_remote_jids);

  UPDATE public.crm_deals
  SET stage = 'novo_lead', approved_at = NULL, rejected_at = NULL, rejection_reason = NULL, updated_at = now()
  WHERE customer_id = ANY(v_ids) OR remote_jid = ANY(v_remote_jids);

  UPDATE public.customers
  SET chat_cleared_at = now(), status = 'pending', updated_at = now(),
      conversation_step = 'welcome', previous_conversation_step = NULL,
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
      bill_requested_at = NULL, phone_contact_confirmed = false,
      name = NULL, name_source = 'reset_manual'
  WHERE id = ANY(v_ids);
END $$;