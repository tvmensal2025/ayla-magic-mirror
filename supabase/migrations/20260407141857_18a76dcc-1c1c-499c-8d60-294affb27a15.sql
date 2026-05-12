CREATE OR REPLACE FUNCTION public.get_coverage_summary()
RETURNS TABLE(distribuidora text, uf text, cidades text, total_clientes bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    c.distribuidora::text,
    c.address_state::text AS uf,
    string_agg(DISTINCT c.address_city, ', ' ORDER BY c.address_city) AS cidades,
    count(*) AS total_clientes
  FROM customers c
  WHERE c.distribuidora IS NOT NULL
    AND c.address_state IS NOT NULL
    AND c.status IN ('active', 'approved', 'pending')
  GROUP BY c.distribuidora, c.address_state
  ORDER BY c.address_state, c.distribuidora;
$$;