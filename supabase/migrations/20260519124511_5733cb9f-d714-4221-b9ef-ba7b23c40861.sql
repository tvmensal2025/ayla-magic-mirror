-- ===== S1.3: Idempotência real das tabelas de dedup =====
ALTER TABLE public.webhook_message_dedup
  ADD CONSTRAINT webhook_message_dedup_unique UNIQUE (message_id, instance_name);

ALTER TABLE public.webhook_message_dedupe
  ADD CONSTRAINT webhook_message_dedupe_unique UNIQUE (message_id, consultant_id);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_message_dedupe_msg_null_consultant
  ON public.webhook_message_dedupe (message_id)
  WHERE consultant_id IS NULL;

COMMENT ON TABLE public.webhook_message_dedup IS
  'Dedup de entrada do webhook (escopo: instância). NAO eh typo de webhook_message_dedupe.';
COMMENT ON TABLE public.webhook_message_dedupe IS
  'Dedup secundario do fluxo conversacional (escopo: consultor). NAO eh typo de webhook_message_dedup.';

-- ===== S1.4: ai_decisions enriquecido + INSERT habilitado =====
ALTER TABLE public.ai_decisions
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS suppressed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS step_before text,
  ADD COLUMN IF NOT EXISTS step_after text,
  ADD COLUMN IF NOT EXISTS reply_sent text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS trace_id text;

CREATE INDEX IF NOT EXISTS ai_decisions_created_at_idx ON public.ai_decisions (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_decisions_consultant_idx ON public.ai_decisions (consultant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_decisions_customer_idx ON public.ai_decisions (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_decisions_low_confidence_idx ON public.ai_decisions (created_at DESC) WHERE confidence < 0.75;

-- Habilita INSERT pelo backend (service role bypassa, mas explicito ajuda na auditoria)
DROP POLICY IF EXISTS "service role inserts ai_decisions" ON public.ai_decisions;
CREATE POLICY "service role inserts ai_decisions"
  ON public.ai_decisions FOR INSERT
  TO public
  WITH CHECK (true);

DROP POLICY IF EXISTS "service role inserts bot_step_transitions" ON public.bot_step_transitions;
CREATE POLICY "service role inserts bot_step_transitions"
  ON public.bot_step_transitions FOR INSERT
  TO public
  WITH CHECK (true);

-- ===== S1.2: Settings table garantida + flag strict_script_mode =====
CREATE TABLE IF NOT EXISTS public.settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read settings" ON public.settings;
CREATE POLICY "authenticated read settings"
  ON public.settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "super admin manages settings" ON public.settings;
CREATE POLICY "super admin manages settings"
  ON public.settings FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

INSERT INTO public.settings (key, value) VALUES
  ('strict_script_mode', 'false'),
  ('ai_confidence_threshold_handoff', '0.5'),
  ('ai_confidence_threshold_execute', '0.75')
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.settings.value IS 'Flag global. strict_script_mode=true desliga geracao de texto pela IA (so classifica).';
