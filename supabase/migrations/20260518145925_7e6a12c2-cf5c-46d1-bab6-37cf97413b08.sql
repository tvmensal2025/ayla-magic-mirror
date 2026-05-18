CREATE OR REPLACE FUNCTION public.reset_consultant_analytics(_consultant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted jsonb := '{}'::jsonb;
  v_count int;
BEGIN
  IF auth.uid() IS DISTINCT FROM _consultant_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  DELETE FROM public.page_views WHERE consultant_id = _consultant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('page_views', v_count);

  DELETE FROM public.page_events WHERE consultant_id = _consultant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('page_events', v_count);

  DELETE FROM public.crm_page_events WHERE consultant_id = _consultant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('crm_page_events', v_count);

  DELETE FROM public.facebook_capi_events WHERE consultant_id = _consultant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('facebook_capi_events', v_count);

  RETURN jsonb_build_object('ok', true, 'consultant_id', _consultant_id, 'deleted', v_deleted);
END;
$$;