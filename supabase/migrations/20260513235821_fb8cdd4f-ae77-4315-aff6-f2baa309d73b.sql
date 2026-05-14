
-- Tabela de log de uso da IA Google (custo, latência, fallback)
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  model text NOT NULL,
  tokens_in int DEFAULT 0,
  tokens_out int DEFAULT 0,
  thinking_tokens int DEFAULT 0,
  latency_ms int DEFAULT 0,
  cost_estimate_cents numeric(10,4) DEFAULT 0,
  outcome text,           -- ok | error | rate_limited | fallback
  degraded boolean DEFAULT false,
  consultant_id uuid,
  customer_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created ON public.ai_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_function ON public.ai_usage_log (function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_consultant ON public.ai_usage_log (consultant_id, created_at DESC);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin reads ai_usage_log"
  ON public.ai_usage_log FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "service role inserts ai_usage_log"
  ON public.ai_usage_log FOR INSERT
  WITH CHECK (true);


-- Playbooks de anúncios derivados de criativos vencedores
CREATE TABLE IF NOT EXISTS public.ad_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid,             -- NULL = playbook global
  scope text NOT NULL DEFAULT 'global', -- 'global' | 'consultant'
  payload jsonb NOT NULL,         -- {hooks:[], tones:[], structures:[], cta:[], banned:[]}
  source_metric text,             -- ex: ctr_top_decile_30d
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_playbooks_consultant ON public.ad_playbooks (consultant_id, generated_at DESC);

ALTER TABLE public.ad_playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultant reads own playbook + global"
  ON public.ad_playbooks FOR SELECT
  USING (consultant_id IS NULL OR consultant_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "service role writes ad_playbooks"
  ON public.ad_playbooks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "service role updates ad_playbooks"
  ON public.ad_playbooks FOR UPDATE
  USING (true);


-- Índice para o closer cron
CREATE INDEX IF NOT EXISTS idx_customers_phase_updated ON public.customers (sales_phase, updated_at DESC);

-- Coluna de auditoria de intenção determinística
ALTER TABLE public.ai_decisions
  ADD COLUMN IF NOT EXISTS intent_detected text;
