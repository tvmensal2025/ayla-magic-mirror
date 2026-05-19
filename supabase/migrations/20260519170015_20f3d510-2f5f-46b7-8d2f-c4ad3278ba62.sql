
-- ============ capture_diagnostics ============
CREATE TABLE IF NOT EXISTS public.capture_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'global', -- 'global' ou 'consultant'
  consultant_id uuid REFERENCES public.consultants(id) ON DELETE CASCADE,
  kpis jsonb NOT NULL DEFAULT '{}'::jsonb,
  bottlenecks jsonb NOT NULL DEFAULT '[]'::jsonb,
  winners jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  sample_size int NOT NULL DEFAULT 0,
  model_used text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capture_diag_scope_time
  ON public.capture_diagnostics(scope, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_capture_diag_consultant
  ON public.capture_diagnostics(consultant_id, computed_at DESC);

ALTER TABLE public.capture_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_read_capture_diag"
  ON public.capture_diagnostics
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- ============ ad_spend_daily ============
CREATE TABLE IF NOT EXISTS public.ad_spend_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL REFERENCES public.consultants(id) ON DELETE CASCADE,
  date date NOT NULL,
  spend_cents bigint NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  leads int NOT NULL DEFAULT 0,
  campaigns jsonb NOT NULL DEFAULT '[]'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consultant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_daily_date
  ON public.ad_spend_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_spend_daily_consultant_date
  ON public.ad_spend_daily(consultant_id, date DESC);

ALTER TABLE public.ad_spend_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_read_ad_spend"
  ON public.ad_spend_daily
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "consultant_read_own_ad_spend"
  ON public.ad_spend_daily
  FOR SELECT
  TO authenticated
  USING (consultant_id = auth.uid());
