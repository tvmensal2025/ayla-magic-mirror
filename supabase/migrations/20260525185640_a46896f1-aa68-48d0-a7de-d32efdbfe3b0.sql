CREATE OR REPLACE FUNCTION public.compute_pos_venda_stage(_submitted_at timestamptz, _status text, _andamento text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _status IN ('rejected','cancelled','canceled') THEN 'reprovado'
    WHEN _andamento IS NOT NULL AND _andamento ~* 'reprov|cancel' THEN 'reprovado'
    WHEN _submitted_at IS NULL THEN 'em_analise'
    WHEN now() - _submitted_at >= interval '120 days' THEN 'd120'
    WHEN now() - _submitted_at >= interval '90 days'  THEN 'd90'
    WHEN now() - _submitted_at >= interval '60 days'  THEN 'd60'
    WHEN now() - _submitted_at >= interval '30 days'  THEN 'd30'
    ELSE 'aprovado'
  END;
$$;

UPDATE public.customers
   SET pos_venda_stage = 'em_analise'
 WHERE customer_origin = 'igreen_sync'
   AND pos_venda_manual = false
   AND portal_submitted_at IS NULL
   AND pos_venda_stage = 'aprovado';