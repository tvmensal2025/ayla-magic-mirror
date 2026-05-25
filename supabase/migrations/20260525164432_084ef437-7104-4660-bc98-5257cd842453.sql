CREATE OR REPLACE FUNCTION public.recompute_pos_venda_stages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH upd AS (
    UPDATE public.customers c
       SET pos_venda_stage = public.compute_pos_venda_stage(c.portal_submitted_at, c.status, c.andamento_igreen),
           updated_at = now()
     WHERE c.customer_origin = 'igreen_sync'
       AND c.pos_venda_manual = false
       AND c.pos_venda_stage IS DISTINCT FROM public.compute_pos_venda_stage(c.portal_submitted_at, c.status, c.andamento_igreen)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;