-- B1: Retenção de engine_logs (30 dias) + índice de varredura por kind/data.
-- M2: índice em customer_flow_state(customer_id) usado pelo loader em hot-path.
-- M3: housekeeping de customer_flow_state órfão (>90 dias sem update).

CREATE INDEX IF NOT EXISTS idx_engine_logs_at ON public.engine_logs (at DESC);
CREATE INDEX IF NOT EXISTS idx_engine_logs_kind_at ON public.engine_logs (kind, at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_flow_state_customer ON public.customer_flow_state (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_flow_state_updated_at ON public.customer_flow_state (updated_at DESC);

-- Função de housekeeping (idempotente, security definer p/ rodar via cron).
CREATE OR REPLACE FUNCTION public.flow_engine_housekeeping()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_logs int := 0;
  deleted_states int := 0;
BEGIN
  -- B1: retenção 30d de engine_logs.
  DELETE FROM public.engine_logs WHERE at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_logs = ROW_COUNT;

  -- M3: customer_flow_state órfão (sem atualização há 90+ dias).
  DELETE FROM public.customer_flow_state
  WHERE updated_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted_states = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_engine_logs', deleted_logs,
    'deleted_flow_states', deleted_states,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.flow_engine_housekeeping() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flow_engine_housekeeping() TO service_role;

-- Agenda diária 03:30 UTC (00:30 BRT) — janela ociosa.
SELECT cron.unschedule('flow_engine_housekeeping_daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'flow_engine_housekeeping_daily');

SELECT cron.schedule(
  'flow_engine_housekeeping_daily',
  '30 3 * * *',
  $$SELECT public.flow_engine_housekeeping();$$
);