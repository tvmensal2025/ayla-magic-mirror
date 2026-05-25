
-- 1) Liberar leads presos por backfill antigo (humano_assumiu_backfill)
UPDATE public.customers
   SET bot_paused = false,
       bot_paused_reason = NULL,
       bot_paused_at = NULL,
       bot_paused_until = NULL,
       assigned_human_id = NULL,
       updated_at = now()
 WHERE bot_paused = true
   AND bot_paused_reason = 'humano_assumiu_backfill';

-- 2) admin_unpause_global_bot agora cobre as duas categorias
CREATE OR REPLACE FUNCTION public.admin_unpause_global_bot()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _affected integer;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas super-admin pode religar o bot global';
  END IF;

  UPDATE public.customers
     SET bot_paused = false,
         bot_paused_reason = NULL,
         bot_paused_at = NULL,
         assigned_human_id = NULL,
         updated_at = now()
   WHERE bot_paused = true
     AND bot_paused_reason IN ('manual_global_pause', 'humano_assumiu_backfill');

  GET DIAGNOSTICS _affected = ROW_COUNT;

  PERFORM public.log_admin_action(
    'global_bot_unpause',
    'customers',
    NULL,
    jsonb_build_object('affected', _affected)
  );

  RETURN _affected;
END;
$function$;

-- 3) Limpar conta de teste nowimportsapple (consultant_id ef2f76c8-eff8-4bfc-922e-f573bb39daa8)
DO $cleanup$
DECLARE
  v_consultant_id uuid := 'ef2f76c8-eff8-4bfc-922e-f573bb39daa8';
  v_customer_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_customer_ids FROM public.customers WHERE consultant_id = v_consultant_id;

  IF v_customer_ids IS NOT NULL AND array_length(v_customer_ids, 1) > 0 THEN
    DELETE FROM public.conversations             WHERE customer_id = ANY(v_customer_ids);
    DELETE FROM public.ai_slot_dispatch_log      WHERE customer_id = ANY(v_customer_ids);
    DELETE FROM public.ai_decisions              WHERE customer_id = ANY(v_customer_ids);
    DELETE FROM public.ai_agent_logs             WHERE customer_id = ANY(v_customer_ids);
    DELETE FROM public.bot_step_transitions      WHERE customer_id = ANY(v_customer_ids);
    DELETE FROM public.bot_handoff_alerts        WHERE customer_id = ANY(v_customer_ids);
    DELETE FROM public.customer_memory           WHERE customer_id = ANY(v_customer_ids);
    DELETE FROM public.whatsapp_message_buffer   WHERE customer_id = ANY(v_customer_ids);
    DELETE FROM public.worker_phase_logs         WHERE customer_id = ANY(v_customer_ids);
    DELETE FROM public.facebook_capi_events      WHERE customer_id = ANY(v_customer_ids);
    DELETE FROM public.customer_flow_state       WHERE customer_id = ANY(v_customer_ids);
    DELETE FROM public.crm_deals                 WHERE consultant_id = v_consultant_id;
    DELETE FROM public.scheduled_messages
      WHERE remote_jid IN (
        SELECT regexp_replace(coalesce(phone_whatsapp,''), '\D', '', 'g') || '@s.whatsapp.net'
        FROM public.customers WHERE id = ANY(v_customer_ids)
      );
    DELETE FROM public.crm_auto_message_log
      WHERE remote_jid IN (
        SELECT regexp_replace(coalesce(phone_whatsapp,''), '\D', '', 'g') || '@s.whatsapp.net'
        FROM public.customers WHERE id = ANY(v_customer_ids)
      );
    DELETE FROM public.customers                 WHERE id = ANY(v_customer_ids);
  END IF;
END
$cleanup$;

-- 4) Limpar 163 leads órfãos com backfill (consultant_id IS NULL) — deletar pois não têm dono
DELETE FROM public.customers
 WHERE consultant_id IS NULL
   AND bot_paused_reason = 'humano_assumiu_backfill';
