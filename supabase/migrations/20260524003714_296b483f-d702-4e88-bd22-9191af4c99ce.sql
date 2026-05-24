
CREATE TABLE IF NOT EXISTS public.ai_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NULL REFERENCES public.consultants(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  model text NOT NULL,
  phase text NOT NULL,
  calls integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  usd_est numeric(12,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consultant_id, day, model, phase)
);

ALTER TABLE public.ai_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_costs super admin all" ON public.ai_costs;
CREATE POLICY "ai_costs super admin all" ON public.ai_costs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_ai_costs_day ON public.ai_costs(day DESC);
CREATE INDEX IF NOT EXISTS idx_ai_costs_consultant_day ON public.ai_costs(consultant_id, day DESC);

ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS ai_persona text NULL;

CREATE INDEX IF NOT EXISTS idx_ai_decisions_customer_created
  ON public.ai_decisions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_consultant_created
  ON public.ai_decisions(consultant_id, created_at DESC);
