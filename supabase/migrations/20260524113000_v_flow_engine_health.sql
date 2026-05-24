-- ============================================================================
-- Phase F Task 33 — View `v_flow_engine_health`.
--
-- Agrega saúde do motor v3 por consultor:
--   - turnos por hora
--   - paused_manual / paused_system
--   - converted today
--   - conversion_rate_24h_pct
--
-- security_invoker=true → respeita RLS de `customer_flow_state`.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_flow_engine_health
WITH (security_invoker = true) AS
SELECT
  c.consultant_id,
  COUNT(*) FILTER (WHERE cfs.updated_at > now() - interval '1 hour') AS turns_last_hour,
  COUNT(*) FILTER (WHERE cfs.status = 'paused_manual')               AS paused_manual,
  COUNT(*) FILTER (WHERE cfs.status = 'paused_system')               AS paused_system,
  COUNT(*) FILTER (WHERE cfs.status = 'converted'
                   AND cfs.updated_at > now() - interval '24 hours') AS converted_today,
  COUNT(*) FILTER (WHERE cfs.status = 'lost'
                   AND cfs.updated_at > now() - interval '24 hours') AS lost_today,
  COUNT(*) FILTER (WHERE cfs.status IN ('running','waiting_reply','waiting_media','waiting_timer')) AS active,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE cfs.status = 'converted'
        AND cfs.updated_at > now() - interval '24 hours'
    )
    / NULLIF(COUNT(*) FILTER (WHERE cfs.created_at > now() - interval '24 hours'), 0),
    1
  ) AS conversion_rate_24h_pct,
  MAX(cfs.updated_at) AS last_activity_at
FROM public.customer_flow_state cfs
JOIN public.customers c ON c.id = cfs.customer_id
WHERE cfs.updated_at > now() - interval '7 days'
GROUP BY c.consultant_id;

COMMENT ON VIEW public.v_flow_engine_health IS
  'Saúde do motor v3 por consultor (Phase F Task 33 do whatsapp-flow-architecture-v3). Consumida pelo dashboard admin (Task 34). Janela: últimos 7 dias por consultor.';
