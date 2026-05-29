-- Migration: engine_logs_kind_at_idx (índice de saúde para queries por kind/janela)
-- Spec: bot-engine-channel-unification (Requisito 9.4)
-- Rollback: DROP INDEX IF EXISTS public.engine_logs_kind_at_idx;

CREATE INDEX IF NOT EXISTS engine_logs_kind_at_idx
  ON public.engine_logs (kind, at DESC);
