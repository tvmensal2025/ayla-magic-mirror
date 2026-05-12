ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tipo_produto text NOT NULL DEFAULT 'energia';

COMMENT ON COLUMN public.customers.tipo_produto IS 'Tipo de produto: energia ou telefonia';