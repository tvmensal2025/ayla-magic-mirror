
-- =====================================================================
-- FASE B — RLS interno + REVOKE de funções + hardening telemetria
-- =====================================================================

-- 1) 10 tabelas internas: service_role only
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ai_cooldown_state',
    'customer_processing_lock',
    'gemini_quota_bucket',
    'inbound_media_failures',
    'inbound_media_retry',
    'outbound_message_log',
    'pending_outbound_media',
    'webhook_message_dedup',
    'webhook_rate_limit'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS service_role_full_access ON public.%I', t);
    EXECUTE format($p$CREATE POLICY service_role_full_access ON public.%I
                      FOR ALL TO service_role USING (true) WITH CHECK (true)$p$, t);
  END LOOP;
END$$;

-- customer_flow_state: dono lê; service_role escreve
REVOKE ALL ON public.customer_flow_state FROM anon;
GRANT SELECT ON public.customer_flow_state TO authenticated;
GRANT ALL ON public.customer_flow_state TO service_role;

DROP POLICY IF EXISTS service_role_full_access ON public.customer_flow_state;
CREATE POLICY service_role_full_access ON public.customer_flow_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS owner_can_read_flow_state ON public.customer_flow_state;
CREATE POLICY owner_can_read_flow_state ON public.customer_flow_state
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_flow_state.customer_id
        AND (c.consultant_id = auth.uid() OR public.is_super_admin(auth.uid()))
    )
  );

-- 2) REVOKE EXECUTE em funções SECURITY DEFINER sensíveis
REVOKE EXECUTE ON FUNCTION public.ai_cooldown_check_and_set(text, integer, text)              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clone_bot_flow_as(uuid, text)                                FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clone_bot_flow_as_b(uuid)                                    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_media_send(uuid, boolean)                            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_gemini_token(uuid, integer)                          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_customer_lock(uuid, uuid)                            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_media_send(uuid, uuid, uuid, text, text)             FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_flow_d(uuid)                                            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sweep_orphan_media_reservations(integer)                     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.try_acquire_customer_lock(uuid, integer)                     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.try_acquire_rate_limit(text, integer, integer)               FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_capture_event_if_new(uuid, uuid, text, text)             FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_pos_venda_stages()                                 FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_consultant_online(uuid)                                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_consultant(uuid, uuid)                              FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_managed_consultant_ids(uuid)                             FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid)                                   FROM anon;

REVOKE EXECUTE ON FUNCTION public.credit_consultant_wallet(uuid, bigint, text, text, text, jsonb)          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_consultant_wallet(uuid, bigint, text, text, text, jsonb, bigint)  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_consultant_wallet(uuid, bigint, uuid, text, jsonb)                 FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_consultant_wallet(uuid, bigint, uuid, text, jsonb, bigint)         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_consultant_wallet(uuid, bigint, text, text, text)                 FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fb_emit_capi(uuid, text, uuid, text, text, numeric)                      FROM anon, authenticated;

COMMENT ON FUNCTION public.credit_consultant_wallet(uuid, bigint, text, text, text, jsonb, bigint)
  IS 'INTERNAL: service_role only (wallet-stripe-webhook).';
COMMENT ON FUNCTION public.debit_consultant_wallet(uuid, bigint, uuid, text, jsonb, bigint)
  IS 'INTERNAL: service_role only (meta-ads-cron).';
COMMENT ON FUNCTION public.refund_consultant_wallet(uuid, bigint, text, text, text)
  IS 'INTERNAL: service_role only (wallet-stripe-webhook refund handler).';

-- 3) Fix search_path mutable
ALTER FUNCTION public.get_referral_partner_metrics() SET search_path = public;

-- 4) Telemetria pública: limites de tamanho de linha
DROP POLICY IF EXISTS "Public insert" ON public.page_views;
CREATE POLICY "Public insert" ON public.page_views
  FOR INSERT TO anon, authenticated
  WITH CHECK (pg_column_size(page_views.*) < 16384);

DROP POLICY IF EXISTS "Public insert" ON public.page_events;
CREATE POLICY "Public insert" ON public.page_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (pg_column_size(page_events.*) < 16384);

DROP POLICY IF EXISTS "Anyone can insert CRM page events" ON public.crm_page_events;
CREATE POLICY "Anyone can insert CRM page events" ON public.crm_page_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (pg_column_size(crm_page_events.*) < 16384);
