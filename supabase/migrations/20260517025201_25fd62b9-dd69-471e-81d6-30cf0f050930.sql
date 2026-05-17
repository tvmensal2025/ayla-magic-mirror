
-- 1. Coluna em customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS pending_flow_switch text NULL;

-- 2. Tabela de regras do router
CREATE TABLE IF NOT EXISTS public.flow_router_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NULL REFERENCES public.consultants(id) ON DELETE CASCADE,
  trigger_keywords text[] NOT NULL,
  target_flow_key text NOT NULL,
  target_flow_label text NOT NULL,
  priority int NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flow_router_rules_active
  ON public.flow_router_rules (is_active, consultant_id, priority DESC);

ALTER TABLE public.flow_router_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read flow router rules" ON public.flow_router_rules;
CREATE POLICY "read flow router rules"
  ON public.flow_router_rules FOR SELECT
  TO authenticated
  USING (consultant_id IS NULL OR consultant_id = auth.uid());

DROP POLICY IF EXISTS "super admin manage flow router rules" ON public.flow_router_rules;
CREATE POLICY "super admin manage flow router rules"
  ON public.flow_router_rules FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "consultant manage own flow router rules" ON public.flow_router_rules;
CREATE POLICY "consultant manage own flow router rules"
  ON public.flow_router_rules FOR ALL
  TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

-- Trigger de updated_at
DROP TRIGGER IF EXISTS trg_flow_router_rules_updated_at ON public.flow_router_rules;
CREATE TRIGGER trg_flow_router_rules_updated_at
  BEFORE UPDATE ON public.flow_router_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Seed inicial (global)
INSERT INTO public.flow_router_rules (consultant_id, trigger_keywords, target_flow_key, target_flow_label, priority)
VALUES
  (NULL,
   ARRAY['pj','pessoa juridica','pessoa jurídica','cnpj','empresa','minha empresa','plano pj','conta pj','meu negocio','meu negócio'],
   'conexao_club_pj', 'Conexão Club PJ', 20),
  (NULL,
   ARRAY['licenciada','licenciado','quero ser licenciado','quero ser licenciada','virar consultor','virar consultora','trabalhar com igreen','representante igreen','quero vender'],
   'licenciada', 'Licenciada / Consultor', 30),
  (NULL,
   ARRAY['residencial','minha casa','conta de casa','pessoa fisica','pessoa física','plano residencial'],
   'residencial', 'Conexão Residencial', 10)
ON CONFLICT DO NOTHING;
