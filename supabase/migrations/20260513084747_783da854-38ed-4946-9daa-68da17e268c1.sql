-- Padrões aprendidos pela IA por consultor
CREATE TABLE public.ad_creative_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  distribuidora text,
  winning_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  losing_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  best_image_traits jsonb NOT NULL DEFAULT '[]'::jsonb,
  best_ctr_bps integer NOT NULL DEFAULT 0,
  best_cpa_cents integer,
  sample_size integer NOT NULL DEFAULT 0,
  summary text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consultant_id, distribuidora)
);

ALTER TABLE public.ad_creative_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own insights" ON public.ad_creative_insights
  FOR SELECT TO authenticated USING (consultant_id = auth.uid());
CREATE POLICY "Admin reads all insights" ON public.ad_creative_insights
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Recomendações pró-ativas para o consultor
CREATE TABLE public.ad_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  action_label text,
  action_payload jsonb,
  dismissed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own recommendations" ON public.ad_recommendations
  FOR SELECT TO authenticated USING (consultant_id = auth.uid());
CREATE POLICY "Owner updates own recommendations" ON public.ad_recommendations
  FOR UPDATE TO authenticated USING (consultant_id = auth.uid()) WITH CHECK (consultant_id = auth.uid());
CREATE POLICY "Admin reads all recommendations" ON public.ad_recommendations
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_ad_recs_consultant_open
  ON public.ad_recommendations (consultant_id, created_at DESC)
  WHERE dismissed_at IS NULL AND applied_at IS NULL;

-- Acelera leitura de métricas pelos crons
CREATE INDEX IF NOT EXISTS idx_fb_metrics_campaign_date
  ON public.facebook_metrics_daily (campaign_id, date DESC);

-- Marca de criativo vencedor/perdedor por ad
CREATE TABLE public.ad_creative_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  fb_ad_id text NOT NULL,
  headline text,
  primary_text text,
  framework text,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  registrations integer NOT NULL DEFAULT 0,
  spend_cents bigint NOT NULL DEFAULT 0,
  score numeric NOT NULL DEFAULT 0,
  is_winner boolean NOT NULL DEFAULT false,
  is_loser boolean NOT NULL DEFAULT false,
  paused_by_ai_at timestamptz,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fb_ad_id)
);

ALTER TABLE public.ad_creative_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own creative perf" ON public.ad_creative_performance
  FOR SELECT TO authenticated USING (consultant_id = auth.uid());
CREATE POLICY "Admin reads all creative perf" ON public.ad_creative_performance
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));