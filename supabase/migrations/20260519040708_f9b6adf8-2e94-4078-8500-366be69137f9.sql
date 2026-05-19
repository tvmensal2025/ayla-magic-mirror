-- Update assign_flow_variant to round-robin A/B/C
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
  -- 1=A, 2=B, 3=C, 4=A...
  RETURN CASE (v_new_counter % 3)
    WHEN 1 THEN 'A'
    WHEN 2 THEN 'B'
    ELSE 'C'
  END;
END;
$$;

-- Clone bot flow as variant C (mirror of clone_bot_flow_as_b)
CREATE OR REPLACE FUNCTION public.clone_bot_flow_as_c(_consultant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a_flow public.bot_flows%ROWTYPE;
  v_c_flow_id uuid;
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

  -- Drop existing C flow if any (cascade steps)
  DELETE FROM public.bot_flow_steps WHERE flow_id IN (
    SELECT id FROM public.bot_flows WHERE consultant_id = _consultant_id AND variant = 'C'
  );
  DELETE FROM public.bot_flows WHERE consultant_id = _consultant_id AND variant = 'C';

  INSERT INTO public.bot_flows (consultant_id, name, is_active, strict_mode, variant)
  VALUES (_consultant_id, v_a_flow.name || ' (C - com video inicial)', true, v_a_flow.strict_mode, 'C')
  RETURNING id INTO v_c_flow_id;

  FOR s IN SELECT * FROM public.bot_flow_steps WHERE flow_id = v_a_flow.id ORDER BY position LOOP
    v_new_id := gen_random_uuid();
    v_map := v_map || jsonb_build_object(s.id::text, v_new_id::text);

    INSERT INTO public.bot_flow_steps (
      id, flow_id, position, step_type, slot_key, message_text,
      wait_for, wait_seconds, condition_text, title, summary, icon,
      is_active, step_key, media_order, transitions, captures, fallback,
      text_delay_ms, auto_detect_doc_type
    ) VALUES (
      v_new_id, v_c_flow_id, s.position, s.step_type, s.slot_key, s.message_text,
      s.wait_for, s.wait_seconds, s.condition_text, s.title, s.summary, s.icon,
      s.is_active, s.step_key, s.media_order, s.transitions, s.captures, s.fallback,
      s.text_delay_ms, s.auto_detect_doc_type
    );
  END LOOP;

  FOR s IN SELECT * FROM public.bot_flow_steps WHERE flow_id = v_c_flow_id LOOP
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

  RETURN v_c_flow_id;
END;
$$;