-- ============================================================
-- AI Learning Improvements
-- 1. ai_knowledge_sections: suporte a consultant_id (base por consultor)
-- 2. ai_decisions: índice para feedback não-nulo (acelera ai-learn-feedback)
-- 3. ad_playbooks: upsert por scope+source_metric (evita acúmulo infinito)
-- 4. v_ai_learning_health: view de saúde do aprendizado para o painel
-- 5. v_flow_step_funnel: funil de abandono por step (FluxoCamila)
-- 6. ai_decisions: coluna intent_detected + step_before índice composto
-- ============================================================

-- 1. Base de conhecimento por consultor
-- NULL = global (comportamento atual preservado)
-- Usa FK para auth.users (consultants.id referencia auth.users.id)
ALTER TABLE public.ai_knowledge_sections
  ADD COLUMN IF NOT EXISTS consultant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Índice para busca eficiente por consultor + global
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_consultant
  ON public.ai_knowledge_sections (consultant_id, is_active, position)
  WHERE is_active = true;

-- Política: consultor lê suas próprias + globais
DROP POLICY IF EXISTS "Public read knowledge" ON public.ai_knowledge_sections;
CREATE POLICY "Consultant reads own + global knowledge"
  ON public.ai_knowledge_sections FOR SELECT TO authenticated
  USING (
    consultant_id IS NULL
    OR consultant_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Política: consultor gerencia suas próprias seções
CREATE POLICY "Consultant manages own knowledge"
  ON public.ai_knowledge_sections FOR ALL TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

-- Política: admin gerencia tudo
DROP POLICY IF EXISTS "Admins manage knowledge" ON public.ai_knowledge_sections;
CREATE POLICY "Admins manage all knowledge"
  ON public.ai_knowledge_sections FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Índice para ai-learn-feedback (busca decisões com feedback não-nulo)
CREATE INDEX IF NOT EXISTS idx_ai_decisions_feedback_not_null
  ON public.ai_decisions (consultant_id, intent_detected, created_at DESC)
  WHERE feedback IS NOT NULL AND intent_detected IS NOT NULL;

-- Índice para few-shot learning (busca exemplos positivos/negativos)
CREATE INDEX IF NOT EXISTS idx_ai_decisions_fewshot
  ON public.ai_decisions (consultant_id, created_at DESC)
  WHERE feedback IS NOT NULL;

-- 3. ad_playbooks: upsert por scope+source_metric (evita acúmulo infinito)
-- As colunas scope e source_metric já existem — apenas adiciona a constraint única
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_ad_playbooks_global_source'
      AND conrelid = 'public.ad_playbooks'::regclass
  ) THEN
    -- Antes de criar a constraint, remove duplicatas mantendo o mais recente
    DELETE FROM public.ad_playbooks a
    USING public.ad_playbooks b
    WHERE a.scope = b.scope
      AND a.source_metric IS NOT DISTINCT FROM b.source_metric
      AND a.consultant_id IS NOT DISTINCT FROM b.consultant_id
      AND a.generated_at < b.generated_at;

    ALTER TABLE public.ad_playbooks
      ADD CONSTRAINT uq_ad_playbooks_global_source
      UNIQUE (scope, source_metric);
  END IF;
EXCEPTION WHEN others THEN
  -- Ignora se falhar (ex: ainda há duplicatas após limpeza)
  RAISE WARNING 'uq_ad_playbooks_global_source: %', SQLERRM;
END $$;

-- 4. View de saúde do aprendizado (consumida pelo painel de inteligência)
CREATE OR REPLACE VIEW public.v_ai_learning_health
WITH (security_invoker = true)
AS
SELECT
  d.consultant_id,
  COUNT(*) AS total_decisions_30d,
  COUNT(*) FILTER (WHERE d.feedback IS NOT NULL) AS decisions_with_feedback,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE d.feedback IS NOT NULL)
    / NULLIF(COUNT(*), 0), 1
  ) AS feedback_rate_pct,
  COUNT(*) FILTER (WHERE (d.feedback->>'rating') = 'up') AS thumbs_up,
  COUNT(*) FILTER (WHERE (d.feedback->>'rating') = 'down') AS thumbs_down,
  COUNT(*) FILTER (WHERE (d.feedback->>'rating') = 'down' AND (d.feedback->>'source') = 'auto_handoff') AS auto_handoff_downs,
  COUNT(DISTINCT d.intent_detected) FILTER (WHERE d.intent_detected IS NOT NULL) AS distinct_intents,
  AVG(d.latency_ms)::int AS avg_latency_ms,
  COUNT(*) FILTER (WHERE d.tool_called = 'request_handoff') AS handoffs_30d,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE d.tool_called = 'request_handoff')
    / NULLIF(COUNT(*), 0), 1
  ) AS handoff_rate_pct,
  MAX(d.created_at) AS last_decision_at
FROM public.ai_decisions d
WHERE d.created_at > now() - interval '30 days'
GROUP BY d.consultant_id;

-- 5. View de funil de abandono por step (FluxoCamila + IntelligenceTab)
-- Usa apenas colunas confirmadas em bot_step_transitions e ai_decisions
CREATE OR REPLACE VIEW public.v_flow_step_funnel
WITH (security_invoker = true)
AS
SELECT
  t.consultant_id,
  t.to_step AS step_key,
  COUNT(*) AS entries,
  COUNT(*) FILTER (WHERE t2.id IS NULL) AS exits_without_advance,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE t2.id IS NULL)
    / NULLIF(COUNT(*), 0), 1
  ) AS abandonment_rate_pct,
  AVG(t.duration_ms)::int AS avg_duration_ms,
  -- Confiança média: extraída do campo ai_output->>'confidence' quando disponível
  AVG(
    CASE
      WHEN d.ai_output IS NOT NULL AND (d.ai_output->>'confidence') IS NOT NULL
      THEN (d.ai_output->>'confidence')::numeric
      ELSE NULL
    END
  )::numeric(4,2) AS avg_confidence,
  MAX(t.created_at) AS last_seen_at
FROM public.bot_step_transitions t
LEFT JOIN public.bot_step_transitions t2
  ON t2.customer_id = t.customer_id
  AND t2.from_step = t.to_step
  AND t2.created_at > t.created_at
  AND t2.created_at < t.created_at + interval '48 hours'
LEFT JOIN public.ai_decisions d
  ON d.customer_id = t.customer_id
  AND d.step_before = t.to_step
  AND d.created_at BETWEEN t.created_at AND t.created_at + interval '5 minutes'
WHERE t.created_at > now() - interval '30 days'
GROUP BY t.consultant_id, t.to_step;

-- 6. View de padrões aprendidos com taxa de uso
CREATE OR REPLACE VIEW public.v_ai_learned_patterns_summary
WITH (security_invoker = true)
AS
SELECT
  lp.consultant_id,
  lp.intent,
  lp.sample_count,
  jsonb_array_length(lp.good_examples) AS good_count,
  jsonb_array_length(lp.bad_examples) AS bad_count,
  lp.updated_at,
  -- Quantas decisões recentes usaram este intent
  COALESCE(d.recent_uses, 0) AS recent_uses_7d
FROM public.ai_learned_patterns lp
LEFT JOIN (
  SELECT consultant_id, intent_detected, COUNT(*) AS recent_uses
  FROM public.ai_decisions
  WHERE created_at > now() - interval '7 days'
    AND intent_detected IS NOT NULL
  GROUP BY consultant_id, intent_detected
) d ON d.consultant_id = lp.consultant_id AND d.intent_detected = lp.intent;
