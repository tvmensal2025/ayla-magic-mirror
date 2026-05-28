CREATE TABLE IF NOT EXISTS public.facebook_ad_metrics_daily (
  fb_ad_id TEXT NOT NULL,
  campaign_id UUID NOT NULL REFERENCES public.facebook_campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions BIGINT NOT NULL DEFAULT 0,
  reach BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  spend_cents BIGINT NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  messaging_conversations_started INTEGER NOT NULL DEFAULT 0,
  complete_registrations INTEGER NOT NULL DEFAULT 0,
  frequency_x100 INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (fb_ad_id, date)
);

CREATE INDEX IF NOT EXISTS idx_fb_ad_metrics_campaign_date ON public.facebook_ad_metrics_daily(campaign_id, date DESC);

GRANT ALL ON public.facebook_ad_metrics_daily TO service_role;

ALTER TABLE public.facebook_ad_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.facebook_ad_metrics_daily FOR ALL TO service_role USING (true) WITH CHECK (true);