
-- ════════════════════════════════════════════════════════════════════
-- Go-Live Hardening Phase 1+2: round-robin A/B/D, CTWA/UTM, snapshots
-- ════════════════════════════════════════════════════════════════════

-- 1) Customers: novas colunas pra atribuição
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS ctwa_clid TEXT,
  ADD COLUMN IF NOT EXISTS lead_source_detail JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_customers_ctwa_clid ON public.customers(ctwa_clid) WHERE ctwa_clid IS NOT NULL;

-- 2) Round-robin trigger: na inserção, se flow_variant for NULL,
--    escolhe a próxima variante ativa do consultor em ordem cíclica
--    baseada no count total de customers daquele consultor.
CREATE OR REPLACE FUNCTION public.assign_flow_variant_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active TEXT[];
  v_count BIGINT;
  v_idx INT;
BEGIN
  -- Respeita variante já definida (testes, simulador, override manual)
  IF NEW.flow_variant IS NOT NULL AND NEW.flow_variant <> '' THEN
    RETURN NEW;
  END IF;

  SELECT active_variants INTO v_active
    FROM public.consultants
    WHERE id = NEW.consultant_id;

  IF v_active IS NULL OR array_length(v_active, 1) IS NULL THEN
    NEW.flow_variant := 'A';
    RETURN NEW;
  END IF;

  IF array_length(v_active, 1) = 1 THEN
    NEW.flow_variant := upper(v_active[1]);
    RETURN NEW;
  END IF;

  -- Round-robin baseado em count de customers existentes (NÃO de teste)
  SELECT COUNT(*) INTO v_count
    FROM public.customers
    WHERE consultant_id = NEW.consultant_id
      AND COALESCE(is_test_lead, false) = false;

  v_idx := (v_count % array_length(v_active, 1)) + 1;
  NEW.flow_variant := upper(v_active[v_idx]);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_flow_variant_on_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_assign_flow_variant ON public.customers;
CREATE TRIGGER trg_assign_flow_variant
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_flow_variant_on_insert();

-- 3) Tabela de snapshot de saúde de produção (alimenta dashboard)
CREATE TABLE IF NOT EXISTS public.production_health_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES public.consultants(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  instance_status TEXT,
  instance_last_seen TIMESTAMPTZ,
  pixel_ok BOOLEAN DEFAULT false,
  capi_ok BOOLEAN DEFAULT false,
  flows_ok BOOLEAN DEFAULT false,
  flows_missing TEXT[] DEFAULT ARRAY[]::TEXT[],
  active_variants TEXT[] DEFAULT ARRAY[]::TEXT[],
  notification_phone_ok BOOLEAN DEFAULT false,
  last_lead_at TIMESTAMPTZ,
  leads_24h INT DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_health_snapshot_consultant_captured
  ON public.production_health_snapshot(consultant_id, captured_at DESC);

GRANT SELECT ON public.production_health_snapshot TO authenticated;
GRANT ALL ON public.production_health_snapshot TO service_role;
ALTER TABLE public.production_health_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_read_health_snapshot"
  ON public.production_health_snapshot
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "service_role_full_health_snapshot"
  ON public.production_health_snapshot
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4) Métricas do flow-d-health-cron
CREATE TABLE IF NOT EXISTS public.flow_d_health_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  leads_scanned INT DEFAULT 0,
  leads_unstuck INT DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  duration_ms INT
);

CREATE INDEX IF NOT EXISTS idx_flow_d_health_runs_ran_at
  ON public.flow_d_health_runs(ran_at DESC);

GRANT SELECT ON public.flow_d_health_runs TO authenticated;
GRANT ALL ON public.flow_d_health_runs TO service_role;
ALTER TABLE public.flow_d_health_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_read_flow_d_runs"
  ON public.flow_d_health_runs
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "service_role_full_flow_d_runs"
  ON public.flow_d_health_runs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
