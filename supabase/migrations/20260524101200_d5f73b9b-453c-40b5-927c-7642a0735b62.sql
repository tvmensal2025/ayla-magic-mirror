
-- ===================================================================
-- Engine V3 — Semana 2: Schema mínimo para ativar dark mode
-- ===================================================================

-- 1. Flag por consultor
ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS flow_engine_v3 text NOT NULL DEFAULT 'off'
  CHECK (flow_engine_v3 IN ('off','dark','canary','on'));

-- 2. Estado canônico do lead (apenas a tabela; triggers/sync ficam para depois)
CREATE TABLE IF NOT EXISTS public.customer_flow_state (
  customer_id        uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  flow_id            uuid,
  current_step_id    text,
  status             text NOT NULL DEFAULT 'new',
  pause_reason       text,
  retries            integer NOT NULL DEFAULT 0,
  entered_step_at    timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz,
  assigned_human_id  uuid,
  last_inbound_at    timestamptz,
  last_outbound_at   timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_flow_state_status     ON public.customer_flow_state(status);
CREATE INDEX IF NOT EXISTS idx_customer_flow_state_updated_at ON public.customer_flow_state(updated_at DESC);

ALTER TABLE public.customer_flow_state ENABLE ROW LEVEL SECURITY;

-- Sem políticas públicas: tudo via service role / edge functions.
-- (RLS habilitada + zero policies = nega tudo no caminho anon/authenticated)

-- 3. View de saúde do engine (alimentada por logs estruturados quando wired ao tick real)
CREATE OR REPLACE VIEW public.v_flow_engine_health AS
SELECT
  c.id                                    AS consultant_id,
  c.name                                  AS consultant_name,
  c.flow_engine_v3                        AS flag,
  COUNT(cfs.customer_id) FILTER (WHERE cfs.updated_at > now() - interval '24 hours') AS turns_24h,
  COUNT(cfs.customer_id) FILTER (WHERE cfs.status LIKE 'paused_%')                    AS paused_total,
  COUNT(cfs.customer_id) FILTER (WHERE cfs.status = 'delegated_legacy')               AS delegated_total,
  COUNT(cfs.customer_id) FILTER (WHERE cfs.status = 'converted')                      AS converted_total,
  COUNT(cfs.customer_id)                                                              AS state_rows_total,
  MAX(cfs.updated_at)                                                                 AS last_tick_at
FROM public.consultants c
LEFT JOIN public.customers cu ON cu.consultant_id = c.id
LEFT JOIN public.customer_flow_state cfs ON cfs.customer_id = cu.id
GROUP BY c.id, c.name, c.flow_engine_v3;
