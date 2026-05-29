-- Migration: bot_engine_production_mode (Production_Mode_Global)
-- Spec: bot-engine-channel-unification (Requisito 8.2)
-- Rollback: ALTER TABLE public.app_settings DROP COLUMN IF EXISTS bot_engine_production_mode;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS bot_engine_production_mode BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.app_settings.bot_engine_production_mode IS
  'bot-engine-channel-unification Production_Mode_Global (Requisito 8.2). '
  'TRUE = Motor_Unificado responde para todos os consultores, ignora Kill_Switch. '
  'Controlado exclusivamente pelo SuperAdmin via UI com confirmação digitando "PRODUCAO". '
  'Reversível enquanto FALSE; após TRUE, kill-switch individual é apenas informativo.';
