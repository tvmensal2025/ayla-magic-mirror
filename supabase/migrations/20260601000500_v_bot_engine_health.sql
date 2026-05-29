-- Migration: v_bot_engine_health (view de agregação por consultant/channel/mode/kind nas últimas 72h)
-- Spec: bot-engine-channel-unification (Requisito 9.4)
-- Rollback: DROP VIEW IF EXISTS public.v_bot_engine_health;

CREATE OR REPLACE VIEW public.v_bot_engine_health AS
SELECT
  consultant_id,
  channel,
  mode,
  kind,
  count(*) AS occurrences
FROM (
  SELECT
    (payload->>'consultant_id') AS consultant_id,
    (payload->>'channel')       AS channel,
    (payload->>'mode')          AS mode,
    kind
  FROM public.engine_logs
  WHERE at >= now() - interval '72 hours'
) t
GROUP BY 1, 2, 3, 4;
