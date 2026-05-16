
-- =========================================================================
-- bot_flow_rules: regras globais de palavra-chave
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.bot_flow_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.bot_flows(id) ON DELETE CASCADE,
  consultant_id uuid NOT NULL,
  name text NOT NULL,
  match_mode text NOT NULL DEFAULT 'contains',
  keywords text[] NOT NULL DEFAULT '{}',
  regex_pattern text,
  normalize boolean NOT NULL DEFAULT true,
  min_word_boundary boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 100,
  scope text NOT NULL DEFAULT 'global',
  scoped_step_ids uuid[] NOT NULL DEFAULT '{}',
  excluded_step_ids uuid[] NOT NULL DEFAULT '{}',
  response_text text,
  media_id uuid REFERENCES public.ai_media_library(id) ON DELETE SET NULL,
  return_behavior text NOT NULL DEFAULT 'stay',
  goto_step_id uuid REFERENCES public.bot_flow_steps(id) ON DELETE SET NULL,
  cooldown_seconds int NOT NULL DEFAULT 60,
  max_fires_per_conversation int,
  is_active boolean NOT NULL DEFAULT true,
  regex_error_count int NOT NULL DEFAULT 0,
  last_regex_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_flow_rules_match_mode_chk CHECK (match_mode IN ('contains','exact','regex')),
  CONSTRAINT bot_flow_rules_scope_chk CHECK (scope IN ('global','step')),
  CONSTRAINT bot_flow_rules_return_chk CHECK (return_behavior IN ('stay','goto_step','restart','handoff')),
  CONSTRAINT bot_flow_rules_scope_steps_chk CHECK (
    scope = 'global' OR array_length(scoped_step_ids, 1) > 0
  ),
  CONSTRAINT bot_flow_rules_goto_chk CHECK (
    return_behavior <> 'goto_step' OR goto_step_id IS NOT NULL
  ),
  CONSTRAINT bot_flow_rules_regex_chk CHECK (
    match_mode <> 'regex' OR (regex_pattern IS NOT NULL AND length(regex_pattern) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_bot_flow_rules_flow_active_priority
  ON public.bot_flow_rules (flow_id, is_active, priority);
CREATE INDEX IF NOT EXISTS idx_bot_flow_rules_consultant
  ON public.bot_flow_rules (consultant_id);
CREATE INDEX IF NOT EXISTS idx_bot_flow_rules_keywords
  ON public.bot_flow_rules USING GIN (keywords);

ALTER TABLE public.bot_flow_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own rules"
  ON public.bot_flow_rules
  FOR ALL TO authenticated
  USING (
    consultant_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.bot_flows f WHERE f.id = bot_flow_rules.flow_id AND f.consultant_id = auth.uid())
  )
  WITH CHECK (
    consultant_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.bot_flows f WHERE f.id = bot_flow_rules.flow_id AND f.consultant_id = auth.uid())
  );

CREATE POLICY "Super admin manages all rules"
  ON public.bot_flow_rules
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Admin reads all rules"
  ON public.bot_flow_rules
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger updated_at
CREATE TRIGGER trg_bot_flow_rules_updated_at
  BEFORE UPDATE ON public.bot_flow_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- bot_flow_rule_fires: auditoria de disparos
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.bot_flow_rule_fires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.bot_flow_rules(id) ON DELETE CASCADE,
  consultant_id uuid NOT NULL,
  customer_id uuid,
  matched_keyword text,
  message_text text,
  step_before text,
  step_after text,
  return_behavior text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_fires_rule_created
  ON public.bot_flow_rule_fires (rule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_fires_customer_created
  ON public.bot_flow_rule_fires (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_fires_consultant_created
  ON public.bot_flow_rule_fires (consultant_id, created_at DESC);

ALTER TABLE public.bot_flow_rule_fires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultant reads own rule fires"
  ON public.bot_flow_rule_fires
  FOR SELECT TO authenticated
  USING (consultant_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

-- =========================================================================
-- customers: campos para "voltar ao passo" e cooldown
-- =========================================================================
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS previous_conversation_step text,
  ADD COLUMN IF NOT EXISTS last_rule_fire_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_rule_id uuid;
