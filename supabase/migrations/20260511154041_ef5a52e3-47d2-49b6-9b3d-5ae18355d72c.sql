
-- =========================================
-- FACEBOOK ADS MODULE - PHASE 1
-- =========================================

-- 1) CONNECTIONS
CREATE TABLE public.facebook_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL UNIQUE,
  fb_user_id TEXT NOT NULL,
  fb_user_name TEXT,
  access_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  business_id TEXT,
  business_name TEXT,
  ad_account_id TEXT,
  ad_account_name TEXT,
  ad_account_currency TEXT,
  page_id TEXT,
  page_name TEXT,
  ig_account_id TEXT,
  ig_account_username TEXT,
  pixel_id TEXT,
  pixel_name TEXT,
  whatsapp_phone_number_id TEXT,
  whatsapp_display_number TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_validated_at TIMESTAMPTZ,
  validation_errors JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.facebook_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultor manages own connection"
  ON public.facebook_connections FOR ALL TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

CREATE POLICY "Admins read all connections"
  ON public.facebook_connections FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_fb_connections_updated_at
  BEFORE UPDATE ON public.facebook_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) CREATIVE PACKS
CREATE TABLE public.facebook_creative_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Pacote sem nome',
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_variants JSONB NOT NULL DEFAULT '{}'::jsonb,
  copy_pack JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.facebook_creative_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultor manages own creative packs"
  ON public.facebook_creative_packs FOR ALL TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

CREATE POLICY "Admins read all creative packs"
  ON public.facebook_creative_packs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_fb_creative_packs_updated_at
  BEFORE UPDATE ON public.facebook_creative_packs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) CAMPAIGNS
CREATE TABLE public.facebook_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL,
  fb_campaign_id TEXT,
  fb_adset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  fb_ad_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  creative_pack_id UUID REFERENCES public.facebook_creative_packs(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  cities JSONB NOT NULL DEFAULT '[]'::jsonb,
  age_min INT NOT NULL DEFAULT 28,
  age_max INT NOT NULL DEFAULT 60,
  daily_budget_cents INT NOT NULL,
  duration_days INT,
  status TEXT NOT NULL DEFAULT 'draft',
  rejection_reason TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fb_campaigns_consultant ON public.facebook_campaigns(consultant_id);
CREATE INDEX idx_fb_campaigns_status ON public.facebook_campaigns(status);

ALTER TABLE public.facebook_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultor manages own campaigns"
  ON public.facebook_campaigns FOR ALL TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

CREATE POLICY "Admins read all campaigns"
  ON public.facebook_campaigns FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_fb_campaigns_updated_at
  BEFORE UPDATE ON public.facebook_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) METRICS DAILY
CREATE TABLE public.facebook_metrics_daily (
  campaign_id UUID NOT NULL REFERENCES public.facebook_campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions BIGINT NOT NULL DEFAULT 0,
  reach BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  ctr_bps INT NOT NULL DEFAULT 0,
  cpm_cents INT NOT NULL DEFAULT 0,
  spend_cents BIGINT NOT NULL DEFAULT 0,
  leads INT NOT NULL DEFAULT 0,
  messaging_conversations_started INT NOT NULL DEFAULT 0,
  cost_per_lead_cents INT NOT NULL DEFAULT 0,
  frequency_x100 INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, date)
);

ALTER TABLE public.facebook_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultor reads own metrics"
  ON public.facebook_metrics_daily FOR SELECT TO authenticated
  USING (campaign_id IN (SELECT id FROM public.facebook_campaigns WHERE consultant_id = auth.uid()));

CREATE POLICY "Admins read all metrics"
  ON public.facebook_metrics_daily FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 5) CAPI EVENTS
CREATE TABLE public.facebook_capi_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL,
  customer_id UUID,
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  fb_response JSONB,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fb_capi_consultant ON public.facebook_capi_events(consultant_id);
CREATE INDEX idx_fb_capi_customer ON public.facebook_capi_events(customer_id);

ALTER TABLE public.facebook_capi_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultor reads own capi events"
  ON public.facebook_capi_events FOR SELECT TO authenticated
  USING (consultant_id = auth.uid());

CREATE POLICY "Admins read all capi events"
  ON public.facebook_capi_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
