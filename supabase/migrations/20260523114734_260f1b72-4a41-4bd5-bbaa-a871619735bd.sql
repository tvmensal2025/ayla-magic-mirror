
-- 1) active_variants em consultants
ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS active_variants text[] NOT NULL DEFAULT ARRAY['A']::text[];

-- Backfill a partir de ab_test_enabled
UPDATE public.consultants
SET active_variants = CASE
  WHEN ab_test_enabled IS TRUE THEN ARRAY['A','B','C']::text[]
  ELSE ARRAY['A']::text[]
END
WHERE active_variants IS NULL OR active_variants = ARRAY['A']::text[];

-- 2) Permitir D e E
ALTER TABLE public.bot_flows DROP CONSTRAINT IF EXISTS bot_flows_variant_check;
ALTER TABLE public.bot_flows
  ADD CONSTRAINT bot_flows_variant_check CHECK (variant IN ('A','B','C','D','E'));

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_flow_variant_check;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_flow_variant_check CHECK (flow_variant IN ('A','B','C','D','E'));

-- 3) Round-robin baseado em active_variants ∩ fluxos existentes
CREATE OR REPLACE FUNCTION public.assign_flow_variant(_consultant_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _active text[];
  _available text[];
  _counter int;
  _idx int;
BEGIN
  SELECT active_variants INTO _active
  FROM public.consultants
  WHERE id = _consultant_id;

  IF _active IS NULL OR array_length(_active, 1) IS NULL THEN
    RETURN 'A';
  END IF;

  -- Mantém apenas as variantes que tenham bot_flows ativo
  SELECT COALESCE(array_agg(v ORDER BY v), ARRAY[]::text[])
  INTO _available
  FROM unnest(_active) AS v
  WHERE EXISTS (
    SELECT 1 FROM public.bot_flows bf
    WHERE bf.consultant_id = _consultant_id
      AND bf.is_active = true
      AND bf.variant = v
  );

  IF _available IS NULL OR array_length(_available, 1) IS NULL THEN
    RETURN 'A';
  END IF;

  IF array_length(_available, 1) = 1 THEN
    RETURN _available[1];
  END IF;

  SELECT COUNT(*)::int INTO _counter
  FROM public.customers
  WHERE consultant_id = _consultant_id;

  _idx := (_counter % array_length(_available, 1)) + 1;
  RETURN _available[_idx];
END;
$$;

-- 4) Clone genérico
CREATE OR REPLACE FUNCTION public.clone_bot_flow_as(_consultant_id uuid, _variant text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _src_flow_id uuid;
  _new_flow_id uuid;
BEGIN
  IF _variant NOT IN ('B','C','D','E') THEN
    RAISE EXCEPTION 'Variante invalida: %', _variant;
  END IF;

  SELECT id INTO _src_flow_id
  FROM public.bot_flows
  WHERE consultant_id = _consultant_id
    AND is_active = true
    AND variant = 'A'
  ORDER BY created_at ASC
  LIMIT 1;

  IF _src_flow_id IS NULL THEN
    RAISE EXCEPTION 'Fluxo A nao encontrado para o consultor';
  END IF;

  -- Remove fluxo existente da variante alvo (cascade nos steps)
  DELETE FROM public.bot_flows
  WHERE consultant_id = _consultant_id AND variant = _variant;

  INSERT INTO public.bot_flows (consultant_id, name, is_active, variant, initial_delay_seconds)
  SELECT consultant_id,
         name || ' (' || _variant || ')',
         true,
         _variant,
         initial_delay_seconds
  FROM public.bot_flows
  WHERE id = _src_flow_id
  RETURNING id INTO _new_flow_id;

  INSERT INTO public.bot_flow_steps (
    flow_id, position, title, step_key, step_type, message_text,
    media_order, retry_text, is_active, transitions
  )
  SELECT _new_flow_id, position, title, step_key, step_type, message_text,
         media_order, retry_text, is_active, transitions
  FROM public.bot_flow_steps
  WHERE flow_id = _src_flow_id;

  RETURN _new_flow_id;
END;
$$;

-- 5) Wrappers legados (compatibilidade)
CREATE OR REPLACE FUNCTION public.clone_bot_flow_as_b(_consultant_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS
$$ SELECT public.clone_bot_flow_as(_consultant_id, 'B'); $$;

CREATE OR REPLACE FUNCTION public.clone_bot_flow_as_c(_consultant_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS
$$ SELECT public.clone_bot_flow_as(_consultant_id, 'C'); $$;
