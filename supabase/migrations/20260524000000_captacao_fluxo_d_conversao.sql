-- ============================================================================
-- Captação Fluxo D + Simulador + Tracking Meta + Reaquecimento
-- Spec: .kiro/specs/captacao-fluxo-d-conversao/requirements.md
-- ============================================================================
-- Idempotente. Cobre Reqs 8, 10, 12, 13, 15, 16, 17, 18.
-- Nada quebra o que já existe — só adiciona tabelas/colunas novas.
-- ============================================================================

-- ─── 1) consultants.timezone (Req 15.6) ────────────────────────────────────
-- Necessário pro cron de reaquecimento respeitar a janela 09h-20h por fuso.
-- Default America/Sao_Paulo.
ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

COMMENT ON COLUMN public.consultants.timezone IS
  'IANA timezone do consultor (ex: America/Sao_Paulo). Usado pelo cron de reaquecimento para respeitar janela 09h-20h.';

-- ─── 2) customers.manual_override_reactivate (Req 17.5) ────────────────────
-- Flag por lead que permite reaquecimento automático mesmo em capture_mode='manual'.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS manual_override_reactivate BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customers.manual_override_reactivate IS
  'Quando true, permite cron de reaquecimento enviar msg mesmo se capture_mode=manual.';

-- ─── 3) Índice de performance (Req 18.1) ───────────────────────────────────
-- Suporta a query principal do Painel_de_Reaquecimento em <2s para 5000 leads.
-- Filtro: consultant_id + status válido + updated_at >= 24h + conversation_step não-nulo.
CREATE INDEX IF NOT EXISTS idx_customers_reactivation
  ON public.customers (consultant_id, updated_at DESC, status, conversation_step)
  WHERE status NOT IN ('approved', 'cancelled')
    AND conversation_step IS NOT NULL;

-- ─── 4) reactivation_templates (Req 12) ────────────────────────────────────
-- Template de reaquecimento por (consultor, conversation_step).
-- Apenas 1 ativo por (consultor, step) — restrição via partial UNIQUE index abaixo.
CREATE TABLE IF NOT EXISTS public.reactivation_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id   UUID NOT NULL REFERENCES public.consultants(id) ON DELETE CASCADE,
  conversation_step TEXT NOT NULL,
  message_text    TEXT NOT NULL CHECK (char_length(message_text) BETWEEN 1 AND 4096),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  auto_reactivate BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Apenas 1 template ATIVO por (consultor, step). Permite múltiplos inativos (histórico).
CREATE UNIQUE INDEX IF NOT EXISTS reactivation_templates_active_unique
  ON public.reactivation_templates (consultant_id, conversation_step)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_reactivation_templates_consultant
  ON public.reactivation_templates (consultant_id, is_active);

ALTER TABLE public.reactivation_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultor manages own reactivation templates"
  ON public.reactivation_templates
  FOR ALL TO authenticated
  USING (consultant_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (consultant_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_reactivation_templates_updated_at
  BEFORE UPDATE ON public.reactivation_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.reactivation_templates IS
  'Templates de mensagem de reaquecimento por (consultor, conversation_step). Permite envio manual ou automático via cron.';

-- ─── 5) reactivation_sends (Reqs 13, 14, 15, 16) ───────────────────────────
-- Registro de cada envio (manual ou auto) + tracking de outcome.
CREATE TABLE IF NOT EXISTS public.reactivation_sends (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  consultant_id     UUID NOT NULL,
  template_id       UUID REFERENCES public.reactivation_templates(id) ON DELETE SET NULL,
  conversation_step TEXT NOT NULL,
  message_text      TEXT NOT NULL,
  trigger_type      TEXT NOT NULL CHECK (trigger_type IN ('manual', 'auto', 'batch')),
  status            TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'pending')) DEFAULT 'sent',
  error_reason      TEXT,
  batch_id          UUID,                 -- agrupa envios em lote
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- tracking de resultado (Req 16)
  lead_responded_at TIMESTAMPTZ,
  lead_advanced_at  TIMESTAMPTZ,
  outcome           TEXT CHECK (outcome IN ('responded', 'advanced', 'abandoned')),
  outcome_set_at    TIMESTAMPTZ,
  retry_count       INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reactivation_sends_customer
  ON public.reactivation_sends (customer_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_reactivation_sends_consultant
  ON public.reactivation_sends (consultant_id, sent_at DESC);

-- Cron precisa achar envios sem outcome ainda + recentes (48h) por (customer, template)
CREATE INDEX IF NOT EXISTS idx_reactivation_sends_pending_outcome
  ON public.reactivation_sends (customer_id, sent_at DESC)
  WHERE outcome IS NULL;

-- Lookup pelo cron de "lead já recebeu envio nas últimas 48h?"
CREATE INDEX IF NOT EXISTS idx_reactivation_sends_recent_by_template
  ON public.reactivation_sends (template_id, customer_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_reactivation_sends_batch
  ON public.reactivation_sends (batch_id)
  WHERE batch_id IS NOT NULL;

ALTER TABLE public.reactivation_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultor reads own reactivation sends"
  ON public.reactivation_sends FOR SELECT TO authenticated
  USING (consultant_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages reactivation sends"
  ON public.reactivation_sends FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Consultor inserts own reactivation sends"
  ON public.reactivation_sends FOR INSERT TO authenticated
  WITH CHECK (consultant_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

COMMENT ON TABLE public.reactivation_sends IS
  'Histórico de envios de reaquecimento. Cada linha = 1 mensagem enviada para 1 lead. Outcome populado por trigger/cron após 7 dias.';

-- ─── 6) campaign_match_log (Req 8.6) ───────────────────────────────────────
-- Auditoria de cada decisão de match lead → campanha.
CREATE TABLE IF NOT EXISTS public.campaign_match_log (
  id              BIGSERIAL PRIMARY KEY,
  customer_id     UUID NOT NULL,
  campaign_id     UUID,                   -- nullable: unmatched
  method          TEXT NOT NULL CHECK (method IN ('ctwa_clid', 'exact_message', 'tsvector', 'unmatched')),
  similarity      NUMERIC(4,3),           -- 0.000 a 1.000 (apenas pra method=tsvector)
  message_sample  TEXT,                   -- primeiros 200 chars da msg do lead (debug)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_match_log_customer
  ON public.campaign_match_log (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_match_log_campaign
  ON public.campaign_match_log (campaign_id, created_at DESC)
  WHERE campaign_id IS NOT NULL;

ALTER TABLE public.campaign_match_log ENABLE ROW LEVEL SECURITY;

-- Service role escreve; admins leem tudo. Sem policy pra usuário comum
-- (auditoria interna, não exposta no painel).
CREATE POLICY "Service role manages match log"
  ON public.campaign_match_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Admins read match log"
  ON public.campaign_match_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

COMMENT ON TABLE public.campaign_match_log IS
  'Auditoria de decisões de Match_de_Campanha. Cada linha = 1 decisão (match ou unmatched).';

-- ─── 7) ctwa_clid_mapping (Req 8.1) ────────────────────────────────────────
-- Mapping ctwa_clid → campaign_id. Populado quando o consultor cadastra
-- a campanha junto com o ctwa_clid (ou via import Meta API).
CREATE TABLE IF NOT EXISTS public.ctwa_clid_mapping (
  ctwa_clid    TEXT PRIMARY KEY CHECK (char_length(ctwa_clid) BETWEEN 1 AND 255),
  campaign_id  UUID NOT NULL REFERENCES public.facebook_campaigns(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctwa_mapping_campaign
  ON public.ctwa_clid_mapping (campaign_id);

ALTER TABLE public.ctwa_clid_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultor manages own ctwa mapping"
  ON public.ctwa_clid_mapping
  FOR ALL TO authenticated
  USING (
    campaign_id IN (SELECT id FROM public.facebook_campaigns WHERE consultant_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    campaign_id IN (SELECT id FROM public.facebook_campaigns WHERE consultant_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Service role manages ctwa mapping"
  ON public.ctwa_clid_mapping FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.ctwa_clid_mapping IS
  'Mapping ctwa_clid → campaign_id. Permite atribuir leads a campanhas Meta com 100% precisão.';

-- ─── 8) GIN index pra match tsvector (Req 8.4) ─────────────────────────────
-- Acelera busca textual em facebook_campaigns.initial_message.
-- Idempotente: só cria se ainda não existe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'facebook_campaigns'
      AND indexname = 'idx_facebook_campaigns_initial_message_gin'
  ) THEN
    CREATE INDEX idx_facebook_campaigns_initial_message_gin
      ON public.facebook_campaigns
      USING GIN (to_tsvector('portuguese', COALESCE(initial_message, '')));
  END IF;
END $$;

-- ─── 9) RPC: list_stuck_leads (Req 10) ─────────────────────────────────────
-- Lista de leads parados há ≥24h, paginada, com filtro opcional por step.
-- Usado pelo Painel_de_Reaquecimento.
CREATE OR REPLACE FUNCTION public.list_stuck_leads(
  p_consultant   UUID,
  p_step         TEXT DEFAULT NULL,
  p_limit        INT DEFAULT 50,
  p_offset       INT DEFAULT 0
) RETURNS TABLE (
  id                  UUID,
  name                TEXT,
  phone_whatsapp      TEXT,
  conversation_step   TEXT,
  flow_variant        TEXT,
  updated_at          TIMESTAMPTZ,
  hours_stuck         NUMERIC,
  total_count         BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  -- Valida acesso
  IF p_consultant != auth.uid() AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Conta total (mesma WHERE da query principal)
  SELECT COUNT(*) INTO v_total
    FROM public.customers c
   WHERE c.consultant_id = p_consultant
     AND c.status NOT IN ('approved', 'cancelled')
     AND c.conversation_step IS NOT NULL
     AND c.updated_at < now() - INTERVAL '24 hours'
     AND (p_step IS NULL OR c.conversation_step = p_step);

  RETURN QUERY
    SELECT
      c.id,
      c.name,
      c.phone_whatsapp,
      c.conversation_step,
      c.flow_variant,
      c.updated_at,
      EXTRACT(EPOCH FROM (now() - c.updated_at)) / 3600 AS hours_stuck,
      v_total AS total_count
    FROM public.customers c
   WHERE c.consultant_id = p_consultant
     AND c.status NOT IN ('approved', 'cancelled')
     AND c.conversation_step IS NOT NULL
     AND c.updated_at < now() - INTERVAL '24 hours'
     AND (p_step IS NULL OR c.conversation_step = p_step)
   ORDER BY c.updated_at ASC, c.id DESC
   LIMIT p_limit
   OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.list_stuck_leads IS
  'Lista leads parados há ≥24h pro Painel_de_Reaquecimento. Retorna total_count em todas as linhas pra evitar query separada de COUNT.';

-- ─── 10) RPC: stuck_leads_grouped_by_step (Req 10.3) ───────────────────────
-- Agrupamento de leads parados por step pro filtro do painel.
CREATE OR REPLACE FUNCTION public.stuck_leads_grouped_by_step(p_consultant UUID)
RETURNS TABLE (conversation_step TEXT, lead_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_consultant != auth.uid() AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
    SELECT c.conversation_step, COUNT(*) AS lead_count
      FROM public.customers c
     WHERE c.consultant_id = p_consultant
       AND c.status NOT IN ('approved', 'cancelled')
       AND c.conversation_step IS NOT NULL
       AND c.updated_at < now() - INTERVAL '24 hours'
     GROUP BY c.conversation_step
     ORDER BY COUNT(*) DESC;
END;
$$;

-- ─── 11) Trigger: atualiza tracking de outcome (Req 16) ────────────────────
-- Quando o lead manda inbound em conversations OU quando conversation_step muda,
-- popula lead_responded_at / lead_advanced_at em reactivation_sends recentes.
CREATE OR REPLACE FUNCTION public.update_reactivation_outcome_on_inbound()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só inbound de cliente
  IF NEW.message_direction != 'inbound' THEN
    RETURN NEW;
  END IF;

  -- Atualiza envio mais recente do lead nos últimos 7 dias que ainda não tem resposta
  UPDATE public.reactivation_sends
     SET lead_responded_at = NEW.created_at
   WHERE customer_id = NEW.customer_id
     AND lead_responded_at IS NULL
     AND sent_at > now() - INTERVAL '7 days'
     AND sent_at < NEW.created_at
     AND status = 'sent';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_track_reactivation ON public.conversations;
CREATE TRIGGER conversations_track_reactivation
  AFTER INSERT ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reactivation_outcome_on_inbound();

-- Trigger pra detectar avanço de passo
CREATE OR REPLACE FUNCTION public.update_reactivation_outcome_on_step_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só quando conversation_step muda
  IF NEW.conversation_step IS NOT DISTINCT FROM OLD.conversation_step THEN
    RETURN NEW;
  END IF;

  UPDATE public.reactivation_sends
     SET lead_advanced_at = now()
   WHERE customer_id = NEW.id
     AND lead_advanced_at IS NULL
     AND sent_at > now() - INTERVAL '7 days'
     AND status = 'sent';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_track_reactivation_advance ON public.customers;
CREATE TRIGGER customers_track_reactivation_advance
  AFTER UPDATE OF conversation_step ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reactivation_outcome_on_step_change();

-- ─── 12) RPC: classify_reactivation_outcomes (Req 16.3-5) ──────────────────
-- Cron-friendly: roda 1x por hora pra fechar envios após 7 dias.
CREATE OR REPLACE FUNCTION public.classify_reactivation_outcomes()
RETURNS TABLE (
  classified_responded INT,
  classified_advanced  INT,
  classified_abandoned INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_responded INT;
  v_advanced  INT;
  v_abandoned INT;
BEGIN
  -- Avançou (responded + step_change) → outcome=advanced
  WITH upd AS (
    UPDATE public.reactivation_sends
       SET outcome = 'advanced', outcome_set_at = now()
     WHERE outcome IS NULL
       AND lead_responded_at IS NOT NULL
       AND lead_advanced_at IS NOT NULL
       AND sent_at < now() - INTERVAL '5 minutes'  -- buffer pro lead acabar de avançar
     RETURNING id
  ) SELECT COUNT(*) INTO v_advanced FROM upd;

  -- Respondeu mas não avançou → responded
  WITH upd AS (
    UPDATE public.reactivation_sends
       SET outcome = 'responded', outcome_set_at = now()
     WHERE outcome IS NULL
       AND lead_responded_at IS NOT NULL
       AND lead_advanced_at IS NULL
       AND sent_at < now() - INTERVAL '7 days'  -- só fecha após 7d (pode ainda avançar)
     RETURNING id
  ) SELECT COUNT(*) INTO v_responded FROM upd;

  -- Não respondeu em 7 dias → abandoned
  WITH upd AS (
    UPDATE public.reactivation_sends
       SET outcome = 'abandoned', outcome_set_at = now()
     WHERE outcome IS NULL
       AND lead_responded_at IS NULL
       AND status = 'sent'
       AND sent_at < now() - INTERVAL '7 days'
     RETURNING id
  ) SELECT COUNT(*) INTO v_abandoned FROM upd;

  RETURN QUERY SELECT v_responded, v_advanced, v_abandoned;
END;
$$;

COMMENT ON FUNCTION public.classify_reactivation_outcomes IS
  'Classifica outcome dos envios de reaquecimento. Rodar 1x/hora via cron pg_cron.';

-- ─── 13) audit_log_extension (Req 18.6, 18.7) ──────────────────────────────
-- Reusa tabela audit_log existente se presente; senão cria minimalista.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_log' AND relkind = 'r') THEN
    CREATE TABLE public.audit_log (
      id            BIGSERIAL PRIMARY KEY,
      consultant_id UUID,
      action        TEXT NOT NULL,
      entity_type   TEXT,
      entity_id     UUID,
      payload       JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_audit_log_consultant_created
      ON public.audit_log (consultant_id, created_at DESC);
    ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Service role manages audit log"
      ON public.audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY "Consultor reads own audit log"
      ON public.audit_log FOR SELECT TO authenticated
      USING (consultant_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK (referência):
-- DROP TABLE public.reactivation_sends, public.reactivation_templates,
--           public.campaign_match_log, public.ctwa_clid_mapping CASCADE;
-- DROP FUNCTION public.list_stuck_leads, public.stuck_leads_grouped_by_step,
--               public.classify_reactivation_outcomes,
--               public.update_reactivation_outcome_on_inbound,
--               public.update_reactivation_outcome_on_step_change;
-- ALTER TABLE public.consultants DROP COLUMN timezone;
-- ALTER TABLE public.customers DROP COLUMN manual_override_reactivate;
-- ============================================================================
