
-- Variant column on bot_flows
ALTER TABLE public.bot_flows
  ADD COLUMN IF NOT EXISTS variant text NOT NULL DEFAULT 'A';

ALTER TABLE public.bot_flows
  DROP CONSTRAINT IF EXISTS bot_flows_variant_check;
ALTER TABLE public.bot_flows
  ADD CONSTRAINT bot_flows_variant_check CHECK (variant IN ('A','B'));

DROP INDEX IF EXISTS public.uniq_bot_flows_active_per_consultant;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bot_flows_active_per_consultant_variant
  ON public.bot_flows (consultant_id, variant)
  WHERE is_active = true;

-- A/B test settings on consultants
ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS ab_test_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ab_test_counter int NOT NULL DEFAULT 0;

-- Per-customer assignment
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS flow_variant text;

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_flow_variant_check;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_flow_variant_check CHECK (flow_variant IS NULL OR flow_variant IN ('A','B'));

-- Backfill existing
UPDATE public.customers SET flow_variant = 'A' WHERE flow_variant IS NULL;

-- Assignment function
CREATE OR REPLACE FUNCTION public.assign_flow_variant(_consultant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_new_counter int;
BEGIN
  SELECT ab_test_enabled INTO v_enabled FROM public.consultants WHERE id = _consultant_id;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN 'A';
  END IF;
  UPDATE public.consultants
     SET ab_test_counter = ab_test_counter + 1
   WHERE id = _consultant_id
   RETURNING ab_test_counter INTO v_new_counter;
  -- 1=A, 2=B, 3=A, 4=B...
  RETURN CASE WHEN v_new_counter % 2 = 1 THEN 'A' ELSE 'B' END;
END;
$$;

-- Trigger before insert on customers
CREATE OR REPLACE FUNCTION public.set_customer_flow_variant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.flow_variant IS NULL AND NEW.consultant_id IS NOT NULL THEN
    NEW.flow_variant := public.assign_flow_variant(NEW.consultant_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_customer_flow_variant ON public.customers;
CREATE TRIGGER trg_set_customer_flow_variant
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_customer_flow_variant();

-- Clone bot flow as variant B
CREATE OR REPLACE FUNCTION public.clone_bot_flow_as_b(_consultant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a_flow public.bot_flows%ROWTYPE;
  v_b_flow_id uuid;
  v_map jsonb := '{}'::jsonb;
  s record;
  v_new_id uuid;
  v_new_transitions jsonb;
  t jsonb;
  v_goto text;
BEGIN
  IF auth.uid() IS DISTINCT FROM _consultant_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO v_a_flow FROM public.bot_flows
   WHERE consultant_id = _consultant_id AND is_active = true AND variant = 'A'
   ORDER BY created_at ASC LIMIT 1;
  IF v_a_flow.id IS NULL THEN RAISE EXCEPTION 'no active A flow'; END IF;

  -- Drop existing B flow if any (cascade steps)
  DELETE FROM public.bot_flow_steps WHERE flow_id IN (
    SELECT id FROM public.bot_flows WHERE consultant_id = _consultant_id AND variant = 'B'
  );
  DELETE FROM public.bot_flows WHERE consultant_id = _consultant_id AND variant = 'B';

  INSERT INTO public.bot_flows (consultant_id, name, is_active, strict_mode, variant)
  VALUES (_consultant_id, v_a_flow.name || ' (B - sem audio)', true, v_a_flow.strict_mode, 'B')
  RETURNING id INTO v_b_flow_id;

  -- First pass: insert new steps, build id mapping
  FOR s IN SELECT * FROM public.bot_flow_steps WHERE flow_id = v_a_flow.id ORDER BY position LOOP
    v_new_id := gen_random_uuid();
    v_map := v_map || jsonb_build_object(s.id::text, v_new_id::text);

    INSERT INTO public.bot_flow_steps (
      id, flow_id, position, step_type, slot_key, message_text,
      wait_for, wait_seconds, condition_text, title, summary, icon,
      is_active, step_key, media_order, transitions, captures, fallback,
      text_delay_ms, auto_detect_doc_type
    ) VALUES (
      v_new_id, v_b_flow_id, s.position, s.step_type, s.slot_key, s.message_text,
      s.wait_for, s.wait_seconds, s.condition_text, s.title, s.summary, s.icon,
      s.is_active, s.step_key, s.media_order, s.transitions, s.captures, s.fallback,
      s.text_delay_ms, s.auto_detect_doc_type
    );
  END LOOP;

  -- Second pass: rewrite transitions[].goto_step_id to new ids
  FOR s IN SELECT * FROM public.bot_flow_steps WHERE flow_id = v_b_flow_id LOOP
    IF s.transitions IS NULL OR jsonb_array_length(s.transitions) = 0 THEN
      CONTINUE;
    END IF;
    v_new_transitions := '[]'::jsonb;
    FOR t IN SELECT * FROM jsonb_array_elements(s.transitions) LOOP
      v_goto := t->>'goto_step_id';
      IF v_goto IS NOT NULL AND v_map ? v_goto THEN
        t := jsonb_set(t, '{goto_step_id}', to_jsonb(v_map->>v_goto));
      END IF;
      v_new_transitions := v_new_transitions || t;
    END LOOP;
    UPDATE public.bot_flow_steps SET transitions = v_new_transitions WHERE id = s.id;
  END LOOP;

  RETURN v_b_flow_id;
END;
$$;
