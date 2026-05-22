-- ============================================================
-- Sistema de Comissões e Conversões
-- 2026-05-22
-- ============================================================

-- 1) Taxa de comissão padrão por campanha
--    Consultor define qual % de comissão esta campanha paga.
--    Valores permitidos: 10, 20, 40, 50, 60, 70, 80, 100
ALTER TABLE public.facebook_campaigns
  ADD COLUMN IF NOT EXISTS commission_rate integer
    CHECK (commission_rate IS NULL OR commission_rate IN (10, 20, 40, 50, 60, 70, 80, 100));

COMMENT ON COLUMN public.facebook_campaigns.commission_rate IS
  'Percentual de comissão padrão desta campanha sobre o valor da fatura (10/20/40/50/60/70/80/100%).';

-- 2) Campos de conversão no customer
--    is_converted: consultor marcou manualmente que este lead virou cliente
--    converted_at: quando foi marcado
--    commission_rate: % aplicado a este lead (herda da campanha, pode ser sobrescrito)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_converted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS commission_rate integer
    CHECK (commission_rate IS NULL OR commission_rate IN (10, 20, 40, 50, 60, 70, 80, 100));

COMMENT ON COLUMN public.customers.is_converted IS
  'Marcado pelo consultor quando o lead foi convertido em cliente ativo.';
COMMENT ON COLUMN public.customers.converted_at IS
  'Timestamp de quando o consultor marcou a conversão.';
COMMENT ON COLUMN public.customers.commission_rate IS
  'Percentual de comissão aplicado a este lead. Herda de facebook_campaigns.commission_rate se null.';

-- 3) Índice para queries de comissão (leads convertidos por consultor)
CREATE INDEX IF NOT EXISTS customers_converted_idx
  ON public.customers(consultant_id, is_converted, converted_at)
  WHERE is_converted = true;

CREATE INDEX IF NOT EXISTS customers_converted_campaign_idx
  ON public.customers(source_campaign_id, is_converted)
  WHERE is_converted = true AND source_campaign_id IS NOT NULL;
