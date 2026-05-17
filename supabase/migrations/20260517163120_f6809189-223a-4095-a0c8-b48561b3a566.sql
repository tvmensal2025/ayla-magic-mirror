-- Swap positions: Boas Vindas (2) and Nome do cliente (3) for consultant 0c2711ad
-- Use a temporary out-of-range position to avoid UNIQUE collisions (if any) on (flow_id, position)
DO $$
DECLARE
  v_flow_id uuid;
  v_nome_id uuid;
  v_bv_id uuid;
BEGIN
  SELECT id INTO v_flow_id
  FROM public.bot_flows
  WHERE consultant_id = '0c2711ad-4836-41e6-afba-edd94f698ae3'
    AND is_active = true
  LIMIT 1;

  IF v_flow_id IS NULL THEN
    RAISE NOTICE 'No active flow found for consultant';
    RETURN;
  END IF;

  SELECT id INTO v_nome_id FROM public.bot_flow_steps
    WHERE flow_id = v_flow_id AND step_key = 'passo_mp8yc0bp';
  SELECT id INTO v_bv_id FROM public.bot_flow_steps
    WHERE flow_id = v_flow_id AND slot_key = 'boas_vindas';

  IF v_nome_id IS NULL OR v_bv_id IS NULL THEN
    RAISE NOTICE 'Steps not found (nome=% bv=%)', v_nome_id, v_bv_id;
    RETURN;
  END IF;

  UPDATE public.bot_flow_steps SET position = 9999 WHERE id = v_nome_id;
  UPDATE public.bot_flow_steps SET position = 2    WHERE id = v_bv_id;
  UPDATE public.bot_flow_steps SET position = 3    WHERE id = v_nome_id;
END $$;