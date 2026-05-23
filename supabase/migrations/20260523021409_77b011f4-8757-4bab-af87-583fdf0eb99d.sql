-- 1) Uma variante ativa por consultor
CREATE UNIQUE INDEX IF NOT EXISTS bot_flows_unique_active_variant
  ON public.bot_flows (consultant_id, variant)
  WHERE is_active = true;

-- 2) Position única dentro do fluxo (entre passos ativos)
CREATE UNIQUE INDEX IF NOT EXISTS bot_flow_steps_unique_position
  ON public.bot_flow_steps (flow_id, position)
  WHERE is_active = true;

-- 3) flow_variant default 'A' em customers (evita NULL silencioso)
ALTER TABLE public.customers
  ALTER COLUMN flow_variant SET DEFAULT 'A';

UPDATE public.customers SET flow_variant = 'A' WHERE flow_variant IS NULL;