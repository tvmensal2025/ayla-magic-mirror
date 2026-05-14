-- 1. Resumo persistido na conversa do lead (rolling summary)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS conversation_summary TEXT,
  ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMPTZ;

-- 2. Padrões aprendidos do feedback dos consultores
CREATE TABLE IF NOT EXISTS public.ai_learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL,
  intent TEXT NOT NULL,
  good_examples JSONB NOT NULL DEFAULT '[]'::jsonb,
  bad_examples JSONB NOT NULL DEFAULT '[]'::jsonb,
  sample_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(consultant_id, intent)
);

ALTER TABLE public.ai_learned_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own learned patterns"
  ON public.ai_learned_patterns
  FOR SELECT TO authenticated
  USING (consultant_id = auth.uid());

CREATE POLICY "Admins read all learned patterns"
  ON public.ai_learned_patterns
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_learned_patterns_consultant_intent
  ON public.ai_learned_patterns(consultant_id, intent);

CREATE TRIGGER trg_learned_patterns_updated_at
  BEFORE UPDATE ON public.ai_learned_patterns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. View de saúde do agente (somente super-admin lê)
CREATE OR REPLACE VIEW public.v_ai_agent_health
WITH (security_invoker = true)
AS
SELECT
  date_trunc('day', d.created_at) AS day,
  d.consultant_id,
  d.phase,
  d.tool_called,
  d.intent_detected,
  d.model,
  COUNT(*) AS decisions,
  AVG(d.latency_ms)::int AS avg_latency_ms,
  COUNT(*) FILTER (WHERE d.reasoning ILIKE '%selfcheck_blocked%') AS selfcheck_blocks,
  COUNT(*) FILTER (WHERE d.tool_called = 'request_handoff') AS handoffs,
  COUNT(*) FILTER (WHERE d.tool_called = 'send_media') AS media_sent
FROM public.ai_decisions d
WHERE d.created_at > now() - interval '30 days'
GROUP BY 1,2,3,4,5,6;