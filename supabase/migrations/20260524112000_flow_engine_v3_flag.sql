-- ============================================================================
-- Phase C Task 20 — Feature flag `flow_engine_v3` por consultor.
--
-- Mesmo padrão da spec antiga (`flow_reliability_v2`):
--   off    → caminho legado puro.
--   dark   → engine v3 calcula em paralelo, só log.
--   canary → engine v3 emite, legado fallback.
--   on     → engine v3 é a fonte de verdade.
--
-- Rollback: UPDATE consultants SET flow_engine_v3='off' WHERE id=...
-- ============================================================================

ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS flow_engine_v3 TEXT NOT NULL DEFAULT 'off';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'consultants_flow_engine_v3_chk'
       AND conrelid = 'public.consultants'::regclass
  ) THEN
    ALTER TABLE public.consultants
      ADD CONSTRAINT consultants_flow_engine_v3_chk
      CHECK (flow_engine_v3 IN ('off','dark','canary','on'));
  END IF;
END $$;

COMMENT ON COLUMN public.consultants.flow_engine_v3 IS
  'Rollout flag para o motor v3 (Phase C Task 20 do whatsapp-flow-architecture-v3). off | dark | canary | on. Rollback: UPDATE consultants SET flow_engine_v3=''off''.';
