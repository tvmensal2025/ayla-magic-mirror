-- Pós-Venda Kanban: novos campos
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS pos_venda_stage text,
  ADD COLUMN IF NOT EXISTS pos_venda_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pos_venda_reason text,
  ADD COLUMN IF NOT EXISTS assigned_consultant_id uuid REFERENCES public.consultants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_pos_venda
  ON public.customers (consultant_id, pos_venda_stage)
  WHERE customer_origin = 'igreen_sync';

CREATE INDEX IF NOT EXISTS idx_customers_assigned
  ON public.customers (assigned_consultant_id)
  WHERE assigned_consultant_id IS NOT NULL;

-- RLS: consultor atribuído também pode ler/editar
CREATE POLICY "Assigned consultant select customers"
  ON public.customers FOR SELECT
  USING (assigned_consultant_id = auth.uid());

CREATE POLICY "Assigned consultant update customers"
  ON public.customers FOR UPDATE
  USING (assigned_consultant_id = auth.uid())
  WITH CHECK (assigned_consultant_id = auth.uid());

-- Função: calcula stage com base em portal_submitted_at e status
CREATE OR REPLACE FUNCTION public.compute_pos_venda_stage(_submitted_at timestamptz, _status text, _andamento text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _status IN ('rejected','cancelled','canceled') THEN 'reprovado'
    WHEN _andamento IS NOT NULL AND _andamento ~* 'reprov|cancel' THEN 'reprovado'
    WHEN _submitted_at IS NULL THEN 'aprovado'
    WHEN now() - _submitted_at >= interval '120 days' THEN 'd120'
    WHEN now() - _submitted_at >= interval '90 days'  THEN 'd90'
    WHEN now() - _submitted_at >= interval '60 days'  THEN 'd60'
    WHEN now() - _submitted_at >= interval '30 days'  THEN 'd30'
    ELSE 'aprovado'
  END;
$$;

-- Backfill inicial para clientes iGreen
UPDATE public.customers
   SET pos_venda_stage = public.compute_pos_venda_stage(portal_submitted_at, status, andamento_igreen)
 WHERE customer_origin = 'igreen_sync'
   AND (pos_venda_stage IS NULL OR pos_venda_manual = false);