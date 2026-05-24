-- ============================================================================
-- Captação Fluxo D — Tasks 11, 13 (parcial) e 6 (`captacao-fluxo-d-conversao`)
--
-- Estende a estrutura de captação criada em
-- `20260524000000_captacao_fluxo_d_conversao.sql` com:
--   - Índice GIN sobre `facebook_campaigns.initial_message` (Req 8.4)
--   - Coluna `similarity_score` em `campaign_match_log` para registrar score
--     da decisão tsvector (complemento de Req 8.6)
--
-- Migração 100% idempotente.
-- ============================================================================

-- ─── Task 11: índice GIN sobre `facebook_campaigns.initial_message` ──────────
CREATE INDEX IF NOT EXISTS facebook_campaigns_initial_message_tsv_idx
  ON public.facebook_campaigns
  USING gin (to_tsvector('portuguese', coalesce(initial_message, '')));

-- ─── Task 13 (parcial): coluna `similarity_score` em `campaign_match_log` ───
-- O backend (`_shared/captation/lead-source.ts`) preenche esta coluna quando
-- `method='tsvector'`. Para `method ∈ {ctwa_clid, exact_message, unmatched}`
-- a coluna fica NULL (não há score). Tipo NUMERIC(4,3) cobre o range [0.000, 9.999].
ALTER TABLE public.campaign_match_log
  ADD COLUMN IF NOT EXISTS similarity_score NUMERIC(4,3);

-- Estende o CHECK de `method` para incluir 'tsvector'.
DO $$
DECLARE
  cons_name TEXT;
BEGIN
  SELECT conname INTO cons_name
    FROM pg_constraint
   WHERE conrelid = 'public.campaign_match_log'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%method%';
  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.campaign_match_log DROP CONSTRAINT %I', cons_name);
  END IF;

  ALTER TABLE public.campaign_match_log
    ADD CONSTRAINT campaign_match_log_method_check CHECK (
      method IN ('ctwa_clid','exact_message','tsvector','unmatched')
    );
END $$;

-- ─── Task 6: documenta os novos `alert_type` em `bot_handoff_alerts` ────────
-- A tabela `bot_handoff_alerts` é schema-livre. O backend escreverá
-- `alert_type ∈ {flow_d_stuck, flow_d_ocr_failed_bill, flow_d_ocr_failed_doc}`
-- em adição aos tipos existentes. Adicionamos um COMMENT só para deixar
-- visível em `\d+`.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='bot_handoff_alerts'
  ) THEN
    EXECUTE 'COMMENT ON TABLE public.bot_handoff_alerts IS
      ''Alertas de handoff para humanos. alert_type cobre tipos legacy + os
       Fluxo D-específicos: flow_d_stuck (lead parado >30s no funil),
       flow_d_ocr_failed_bill (OCR da conta de luz falhou),
       flow_d_ocr_failed_doc (OCR do documento falhou).''';
  END IF;
END $$;

-- ─── Task 21 (preparação): trigger_type já existe em reactivation_sends ─────
-- Verificação defensiva: se trigger_type não existe (instalação parcial da
-- migration anterior), adiciona com default 'manual'. NÃO recria o CHECK
-- porque a migration anterior já define `trigger_type IN ('manual','auto','batch')`.
ALTER TABLE public.reactivation_sends
  ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'manual';


-- ============================================================================
-- RPC: match_campaigns_by_initial_message (Requirement 8.4 + Task 13)
--
-- Dado um consultor e a primeira mensagem do lead, retorna as top-N
-- campanhas mais similares por full-text search com `ts_rank` normalizado.
--
-- Score retornado:
--   ts_rank_cd usando tsvector('portuguese', initial_message) e
--   plainto_tsquery('portuguese', p_query). Normalização 32 (length)
--   garante que o rank fica entre 0..1 mesmo com queries longas.
--
-- Caller (Edge Function `_shared/captation/lead-source.ts`) filtra
-- score ≥ 0.7. Aqui só ordenamos por score DESC + created_at DESC.
--
-- SECURITY DEFINER + search_path explícito para compatibilizar com
-- chamadas da Edge Function (service role).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.match_campaigns_by_initial_message(
  p_consultant UUID,
  p_query      TEXT,
  p_limit      INT DEFAULT 5
)
RETURNS TABLE (
  campaign_id UUID,
  score       NUMERIC,
  created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_query IS NULL OR length(btrim(p_query)) < 5 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    fc.id AS campaign_id,
    -- ts_rank_cd com normalização 32 = log(1 + doc length) — bom default.
    -- Multiplicamos por uma constante para que o range fique aproximadamente
    -- [0..1] em queries típicas; caller filtra >= 0.7.
    LEAST(1.0, (ts_rank_cd(
      to_tsvector('portuguese', coalesce(fc.initial_message, '')),
      plainto_tsquery('portuguese', p_query),
      32
    ) * 4.0)::NUMERIC) AS score,
    fc.created_at
  FROM public.facebook_campaigns fc
  WHERE fc.consultant_id = p_consultant
    AND fc.initial_message IS NOT NULL
    AND length(btrim(fc.initial_message)) >= 5
    AND to_tsvector('portuguese', fc.initial_message)
        @@ plainto_tsquery('portuguese', p_query)
  ORDER BY score DESC, fc.created_at DESC
  LIMIT GREATEST(1, LEAST(20, p_limit));
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_campaigns_by_initial_message(UUID, TEXT, INT) TO authenticated, service_role;
