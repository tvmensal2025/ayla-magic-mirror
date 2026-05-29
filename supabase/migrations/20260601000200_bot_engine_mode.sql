-- Migration: bot_engine_mode (Kill_Switch por consultor)
-- Spec: bot-engine-channel-unification (Requisito 8.1)
-- Rollback: ALTER TABLE public.consultants DROP CONSTRAINT IF EXISTS consultants_bot_engine_mode_chk; ALTER TABLE public.consultants DROP COLUMN IF EXISTS bot_engine_mode;

ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS bot_engine_mode TEXT NOT NULL DEFAULT 'legacy';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'consultants_bot_engine_mode_chk'
       AND conrelid = 'public.consultants'::regclass
  ) THEN
    ALTER TABLE public.consultants
      ADD CONSTRAINT consultants_bot_engine_mode_chk
      CHECK (bot_engine_mode IN ('legacy','dark','canary','on'));
  END IF;
END $$;

COMMENT ON COLUMN public.consultants.bot_engine_mode IS
  'bot-engine-channel-unification Kill_Switch (Requisito 8.1). legacy|dark|canary|on. '
  'Subordinado a app_settings.bot_engine_production_mode: quando esta for TRUE, '
  'bot_engine_mode é informativo. Default legacy = comportamento atual preservado.';
