do $$
declare
  target_phones text[] := array['5511971254913','5511989000650'];
  target_customer_ids uuid[];
begin
  select coalesce(array_agg(id), array[]::uuid[])
    into target_customer_ids
  from public.customers
  where regexp_replace(phone_whatsapp, '\D', '', 'g') = any(target_phones);

  delete from public.conversations where customer_id = any(target_customer_ids);
  delete from public.ai_slot_dispatch_log where customer_id = any(target_customer_ids);
  delete from public.customer_memory where customer_id = any(target_customer_ids);
  delete from public.bot_step_transitions where customer_id = any(target_customer_ids);
  delete from public.bot_flow_rule_fires where customer_id = any(target_customer_ids);
  delete from public.whatsapp_message_buffer where phone = any(target_phones);
  delete from public.worker_phase_logs where customer_id = any(target_customer_ids);

  update public.crm_deals
     set stage = 'novo_lead',
         approved_at = null,
         rejected_at = null,
         rejection_reason = null,
         updated_at = now()
   where customer_id = any(target_customer_ids);

  update public.customers
     set conversation_step = 'welcome',
         previous_conversation_step = null,
         last_rule_id = null,
         last_rule_fire_at = null,
         name = null,
         name_source = 'reset_manual',
         electricity_bill_value = null,
         cpf = null,
         status = 'pending',
         bot_paused = false,
         bot_paused_reason = null,
         bot_paused_at = null,
         last_bot_reply_at = null,
         last_bot_interaction_at = null,
         updated_at = now()
   where id = any(target_customer_ids);
end $$;