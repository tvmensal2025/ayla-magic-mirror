
CREATE TABLE IF NOT EXISTS public.customer_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  consultant_id uuid NOT NULL,
  category text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.7,
  source text NOT NULL DEFAULT 'inferido',
  last_confirmed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, category, key)
);

CREATE INDEX IF NOT EXISTS idx_customer_memory_lookup
  ON public.customer_memory (customer_id, active, category);
CREATE INDEX IF NOT EXISTS idx_customer_memory_consultant
  ON public.customer_memory (consultant_id);

ALTER TABLE public.customer_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own customer memory"
  ON public.customer_memory FOR ALL TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

CREATE POLICY "Admins read all customer memory"
  ON public.customer_memory FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_customer_memory_updated_at
  BEFORE UPDATE ON public.customer_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE VIEW public.customer_memory_active AS
  SELECT * FROM public.customer_memory
  WHERE active = true
    AND (expires_at IS NULL OR expires_at > now());
