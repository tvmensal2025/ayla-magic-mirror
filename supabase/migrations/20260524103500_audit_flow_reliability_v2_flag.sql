-- ============================================================================
-- Auditoria + Plano de elevação do flag `flow_reliability_v2`
-- Task 2 do whatsapp-flow-architecture-v3 (que reaproveita rollout pendente
-- do whatsapp-flow-reliability-fix Phase 8 / Task 41).
--
-- Esta migration NÃO altera dados em produção automaticamente.
-- Ela apenas:
--   1. Cria/atualiza a view `v_flow_reliability_v2_audit` que mostra a
--      distribuição atual do flag por consultor.
--   2. Documenta os comandos manuais que devem ser executados em ordem
--      pelo operador, com janelas de observação.
--
-- Rollout aprovado para a Phase 0 (não tem nada além de operação):
--   T+0     UPDATE consultants SET flow_reliability_v2='dark'  WHERE flow_reliability_v2='off';
--   T+24h   verificar v_flow_reliability_v2_audit + logs `evolution_dedup_short_circuit`
--   T+24h   UPDATE consultants SET flow_reliability_v2='canary'
--             WHERE id IN (lista de 5% dos consultores ativos por random hash);
--   T+72h   se zero p1 => UPDATE consultants SET flow_reliability_v2='on';
--
-- Rollback (any phase): UPDATE consultants SET flow_reliability_v2='off';
-- ============================================================================

CREATE OR REPLACE VIEW public.v_flow_reliability_v2_audit
WITH (security_invoker = true) AS
SELECT
  flow_reliability_v2 AS flag_value,
  COUNT(*)            AS consultants_count,
  ROUND(
    100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0),
    1
  )                   AS pct_of_total
FROM public.consultants
GROUP BY flow_reliability_v2
ORDER BY consultants_count DESC;

COMMENT ON VIEW public.v_flow_reliability_v2_audit IS
  'Distribuição do flag flow_reliability_v2 entre consultores. Consumida pelo dashboard de rollout. Use em conjunto com v_flow_engine_health (criada na Phase F do whatsapp-flow-architecture-v3) para validar paridade dark mode.';
