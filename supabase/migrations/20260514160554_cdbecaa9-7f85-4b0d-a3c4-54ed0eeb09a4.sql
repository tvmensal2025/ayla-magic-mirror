
DO $$
DECLARE
  _ids uuid[];
  _jids text[];
BEGIN
  SELECT array_agg(id), array_agg(DISTINCT regexp_replace(phone_whatsapp,'[^0-9]','','g') || '@s.whatsapp.net')
    INTO _ids, _jids
  FROM public.customers
  WHERE regexp_replace(COALESCE(phone_whatsapp,''),'[^0-9]','','g') ~ '(11989000650|11971254913)';

  IF _ids IS NULL THEN RETURN; END IF;

  DELETE FROM public.conversations         WHERE customer_id = ANY(_ids);
  DELETE FROM public.ai_decisions          WHERE customer_id = ANY(_ids);
  DELETE FROM public.ai_agent_logs         WHERE customer_id = ANY(_ids);
  DELETE FROM public.ai_slot_dispatch_log  WHERE customer_id = ANY(_ids);
  DELETE FROM public.ai_usage_log          WHERE customer_id = ANY(_ids);
  DELETE FROM public.bot_step_transitions  WHERE customer_id = ANY(_ids);
  DELETE FROM public.customer_memory       WHERE customer_id = ANY(_ids);
  DELETE FROM public.worker_phase_logs     WHERE customer_id = ANY(_ids);
  DELETE FROM public.facebook_capi_events  WHERE customer_id = ANY(_ids);
  DELETE FROM public.crm_deals             WHERE customer_id = ANY(_ids) OR remote_jid = ANY(_jids);
  DELETE FROM public.crm_auto_message_log  WHERE remote_jid = ANY(_jids);
  DELETE FROM public.scheduled_messages    WHERE remote_jid = ANY(_jids);
  DELETE FROM public.customer_tags         WHERE remote_jid = ANY(_jids);
  DELETE FROM public.customers             WHERE id = ANY(_ids);
END $$;
