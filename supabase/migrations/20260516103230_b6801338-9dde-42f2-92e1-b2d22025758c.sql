DO $$
DECLARE
  target_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO target_ids
  FROM public.customers
  WHERE regexp_replace(coalesce(phone_whatsapp,''),'\D','','g') IN ('5511971254913','5511989000650');

  IF target_ids IS NULL THEN RETURN; END IF;

  DELETE FROM public.conversations WHERE customer_id = ANY(target_ids);
  DELETE FROM public.ai_slot_dispatch_log WHERE customer_id = ANY(target_ids);
  DELETE FROM public.customer_memory WHERE customer_id = ANY(target_ids);
  DELETE FROM public.bot_step_transitions WHERE customer_id = ANY(target_ids);
  DELETE FROM public.bot_flow_rule_fires WHERE customer_id = ANY(target_ids);
  DELETE FROM public.whatsapp_message_buffer WHERE customer_id = ANY(target_ids);
  DELETE FROM public.worker_phase_logs WHERE customer_id = ANY(target_ids);

  UPDATE public.crm_deals
    SET stage='novo_lead', approved_at=NULL, rejected_at=NULL, rejection_reason=NULL, updated_at=now()
    WHERE customer_id = ANY(target_ids);

  UPDATE public.customers
    SET name=NULL, name_source='reset_manual',
        electricity_bill_value=NULL, cpf=NULL,
        conversation_step='welcome',
        previous_conversation_step=NULL,
        last_rule_id=NULL, last_rule_fire_at=NULL,
        bot_paused=false, bot_paused_reason=NULL, bot_paused_at=NULL, bot_paused_until=NULL,
        status='pending', updated_at=now()
    WHERE id = ANY(target_ids);
END $$;