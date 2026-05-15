CREATE TABLE IF NOT EXISTS public.bot_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  customer_id uuid,
  consultant_id uuid,
  scenario text NOT NULL DEFAULT 'happy_path',
  summary jsonb,
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.bot_test_outbound (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.bot_test_runs(id) ON DELETE CASCADE,
  turn integer NOT NULL,
  direction text NOT NULL,
  kind text NOT NULL,
  content text,
  conversation_step_before text,
  conversation_step_after text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_test_outbound_run_id ON public.bot_test_outbound(run_id, turn);

ALTER TABLE public.bot_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_test_outbound ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_bot_test_runs" ON public.bot_test_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE POLICY "admin_read_bot_test_outbound" ON public.bot_test_outbound
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.cleanup_bot_test_data(_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _customer_id uuid;
  _deleted jsonb := '{}'::jsonb;
  _n int;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT customer_id INTO _customer_id FROM public.bot_test_runs WHERE id = _run_id;

  IF _customer_id IS NOT NULL THEN
    DELETE FROM public.conversations WHERE customer_id = _customer_id;
    GET DIAGNOSTICS _n = ROW_COUNT; _deleted := _deleted || jsonb_build_object('conversations', _n);

    DELETE FROM public.bot_step_transitions WHERE customer_id = _customer_id;
    GET DIAGNOSTICS _n = ROW_COUNT; _deleted := _deleted || jsonb_build_object('transitions', _n);

    DELETE FROM public.customers WHERE id = _customer_id;
    GET DIAGNOSTICS _n = ROW_COUNT; _deleted := _deleted || jsonb_build_object('customers', _n);
  END IF;

  DELETE FROM public.bot_test_outbound WHERE run_id = _run_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _deleted := _deleted || jsonb_build_object('outbound', _n);

  DELETE FROM public.bot_test_runs WHERE id = _run_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _deleted := _deleted || jsonb_build_object('runs', _n);

  -- Garbage collection: testes >7 dias
  DELETE FROM public.bot_test_runs WHERE started_at < now() - interval '7 days';

  RETURN jsonb_build_object('ok', true, 'deleted', _deleted);
END;
$function$;