
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS pain_point text,
  ADD COLUMN IF NOT EXISTS qualification_score int,
  ADD COLUMN IF NOT EXISTS intent_signals jsonb,
  ADD COLUMN IF NOT EXISTS next_followup_at timestamptz,
  ADD COLUMN IF NOT EXISTS sales_phase text;

CREATE INDEX IF NOT EXISTS idx_customers_next_followup_at
  ON public.customers (next_followup_at)
  WHERE next_followup_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ai_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  consultant_id uuid NOT NULL,
  phase text NOT NULL,
  tool_called text NOT NULL,
  reasoning text,
  user_input text,
  ai_output jsonb,
  latency_ms int,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_decisions_customer ON public.ai_decisions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_consultant ON public.ai_decisions(consultant_id, created_at DESC);

ALTER TABLE public.ai_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own ai decisions"
  ON public.ai_decisions FOR SELECT TO authenticated
  USING (consultant_id = auth.uid());

CREATE POLICY "Admins read all ai decisions"
  ON public.ai_decisions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
