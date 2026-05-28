
-- ════════════════════════════════════════════════════════════════════
-- Per-lead AI bypass (force_bot_active) for individual override of the
-- global ai_agent_config.enabled flag.
-- ════════════════════════════════════════════════════════════════════

-- 1. Coluna no customers para forçar bot ativo NESSE lead mesmo com
--    a IA global desligada (ai_agent_config.enabled=false).
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS bot_force_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customers.bot_force_enabled IS
  'Quando true, webhook ignora ai_agent_config.enabled=false (IA global off) só para este lead. Setado pelo botão Zerar e pelo toggle individual de IA no chat.';

-- 2. Tabela de "intenções" para sobreviver ao DELETE do reset.
--    Reset apaga o customer; quando a próxima mensagem chega o webhook
--    cria um novo customer. Esta tabela guarda phone+consultant para
--    o trigger transferir bot_force_enabled=true ao novo customer.
CREATE TABLE IF NOT EXISTS public.force_bot_phones (
  consultant_id uuid NOT NULL,
  phone_digits text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consultant_id, phone_digits)
);

GRANT SELECT, INSERT, DELETE ON public.force_bot_phones TO authenticated;
GRANT ALL ON public.force_bot_phones TO service_role;

ALTER TABLE public.force_bot_phones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultant owns force_bot_phones"
  ON public.force_bot_phones
  FOR ALL
  USING (auth.uid() = consultant_id OR public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (auth.uid() = consultant_id OR public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- 3. Trigger: ao inserir customer, se houver intenção pendente, marca
--    bot_force_enabled=true e remove a linha de force_bot_phones.
CREATE OR REPLACE FUNCTION public.apply_force_bot_on_customer_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_found boolean;
BEGIN
  v_phone := regexp_replace(coalesce(NEW.phone_whatsapp,''), '\D', '', 'g');
  IF v_phone IS NULL OR length(v_phone) < 8 THEN
    RETURN NEW;
  END IF;
  SELECT true INTO v_found
    FROM public.force_bot_phones
   WHERE consultant_id = NEW.consultant_id
     AND phone_digits = v_phone
   LIMIT 1;
  IF v_found THEN
    NEW.bot_force_enabled := true;
    DELETE FROM public.force_bot_phones
      WHERE consultant_id = NEW.consultant_id AND phone_digits = v_phone;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_force_bot_on_customer_insert ON public.customers;
CREATE TRIGGER trg_apply_force_bot_on_customer_insert
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_force_bot_on_customer_insert();

-- 4. reset_lead_conversation: registra intenção force_bot ANTES de deletar.
CREATE OR REPLACE FUNCTION public.reset_lead_conversation(
  _consultant_id uuid,
  _customer_id uuid DEFAULT NULL::uuid,
  _remote_jid text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_id uuid := _customer_id;
  v_phone_digits text;
  v_remote_jid text := _remote_jid;
  v_deleted jsonb := '{}'::jsonb;
  v_count int;
BEGIN
  IF auth.uid() IS DISTINCT FROM _consultant_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF v_remote_jid IS NOT NULL THEN
    v_phone_digits := regexp_replace(split_part(v_remote_jid, '@', 1), '\D', '', 'g');
    IF v_phone_digits IS NOT NULL AND length(v_phone_digits) >= 8 AND NOT v_phone_digits LIKE '55%' THEN
      v_phone_digits := '55' || v_phone_digits;
    END IF;
    v_remote_jid := v_phone_digits || '@s.whatsapp.net';
  END IF;

  IF v_customer_id IS NULL AND v_phone_digits IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM customers
     WHERE consultant_id = _consultant_id
       AND regexp_replace(coalesce(phone_whatsapp,''), '\D', '', 'g') = v_phone_digits
     ORDER BY created_at DESC
     LIMIT 1;
  END IF;

  -- Se ainda não sabemos o telefone mas temos customer_id, deriva.
  IF v_phone_digits IS NULL AND v_customer_id IS NOT NULL THEN
    SELECT regexp_replace(coalesce(phone_whatsapp,''), '\D', '', 'g')
      INTO v_phone_digits
      FROM customers WHERE id = v_customer_id;
  END IF;

  -- Registra intenção: próximo customer criado para esse telefone
  -- volta a ter bot_force_enabled=true (bypass do global-off-silent).
  IF v_phone_digits IS NOT NULL AND length(v_phone_digits) >= 8 THEN
    INSERT INTO public.force_bot_phones (consultant_id, phone_digits)
      VALUES (_consultant_id, v_phone_digits)
      ON CONFLICT (consultant_id, phone_digits) DO UPDATE SET created_at = now();
  END IF;

  IF v_customer_id IS NULL THEN
    IF v_remote_jid IS NOT NULL THEN
      DELETE FROM scheduled_messages WHERE remote_jid = v_remote_jid;
      DELETE FROM crm_auto_message_log WHERE remote_jid = v_remote_jid;
      DELETE FROM crm_deals WHERE consultant_id = _consultant_id AND remote_jid = v_remote_jid;
    END IF;
    RETURN jsonb_build_object('ok', true, 'customer_id', null, 'note', 'no_customer');
  END IF;

  DELETE FROM conversations WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('conversations', v_count);

  DELETE FROM ai_slot_dispatch_log WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('ai_slot_dispatch_log', v_count);

  DELETE FROM ai_decisions WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('ai_decisions', v_count);

  DELETE FROM ai_agent_logs WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('ai_agent_logs', v_count);

  DELETE FROM bot_step_transitions WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('bot_step_transitions', v_count);

  DELETE FROM bot_handoff_alerts WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('bot_handoff_alerts', v_count);

  DELETE FROM customer_memory WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('customer_memory', v_count);

  DELETE FROM whatsapp_message_buffer WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('whatsapp_message_buffer', v_count);

  IF v_phone_digits IS NOT NULL THEN
    DELETE FROM whatsapp_message_buffer
      WHERE regexp_replace(coalesce(phone,''), '\D', '', 'g') = v_phone_digits;
    GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('whatsapp_message_buffer_by_phone', v_count);
  END IF;

  DELETE FROM worker_phase_logs WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('worker_phase_logs', v_count);

  DELETE FROM facebook_capi_events WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('facebook_capi_events', v_count);

  DELETE FROM crm_deals WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('crm_deals', v_count);

  IF v_remote_jid IS NOT NULL THEN
    DELETE FROM crm_deals WHERE consultant_id = _consultant_id AND remote_jid = v_remote_jid;
    GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('crm_deals_by_jid', v_count);

    DELETE FROM scheduled_messages WHERE remote_jid = v_remote_jid;
    GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('scheduled_messages', v_count);

    DELETE FROM crm_auto_message_log WHERE remote_jid = v_remote_jid;
    GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('crm_auto_message_log', v_count);
  END IF;

  DELETE FROM customer_flow_state WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('customer_flow_state', v_count);

  DELETE FROM customers WHERE id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('customers', v_count);

  RETURN jsonb_build_object('ok', true, 'customer_id', v_customer_id, 'deleted', v_deleted);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reset_lead_conversation(uuid, uuid, text) TO authenticated;
