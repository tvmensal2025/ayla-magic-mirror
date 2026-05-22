-- ============================================================
-- Lead Attribution + Flow Initial Delay
-- 2026-05-22
-- ============================================================

-- 1) Delay inicial configurável no bot_flows
--    Consultor define quantos segundos o bot espera antes de
--    enviar a primeira mensagem (evita parecer robô imediato).
ALTER TABLE public.bot_flows
  ADD COLUMN IF NOT EXISTS initial_delay_seconds integer NOT NULL DEFAULT 0
    CHECK (initial_delay_seconds >= 0 AND initial_delay_seconds <= 300);

COMMENT ON COLUMN public.bot_flows.initial_delay_seconds IS
  'Segundos de espera antes de enviar a primeira mensagem do fluxo. 0 = imediato. Máx 300s (5 min).';

-- 2) Rastreamento de campanha no customer
--    Guarda qual campanha (facebook_campaigns.id) originou o lead.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS source_campaign_id uuid REFERENCES public.facebook_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_ctwa_clid text,
  ADD COLUMN IF NOT EXISTS source_referral jsonb;

CREATE INDEX IF NOT EXISTS customers_source_campaign_idx
  ON public.customers(source_campaign_id)
  WHERE source_campaign_id IS NOT NULL;

COMMENT ON COLUMN public.customers.source_campaign_id IS
  'Campanha Facebook que originou este lead (via CTWA referral ou match de initial_message).';
COMMENT ON COLUMN public.customers.source_ctwa_clid IS
  'ctwa_clid do Meta — identificador único do clique no anúncio CTWA.';
COMMENT ON COLUMN public.customers.source_referral IS
  'Payload completo do referral/context do Meta (ad_id, adset_id, campaign_id, etc).';

-- 3) Índice para busca de initial_message nas campanhas
CREATE INDEX IF NOT EXISTS facebook_campaigns_initial_message_idx
  ON public.facebook_campaigns USING gin(to_tsvector('portuguese', coalesce(initial_message, '')))
  WHERE initial_message IS NOT NULL AND initial_message != '';
