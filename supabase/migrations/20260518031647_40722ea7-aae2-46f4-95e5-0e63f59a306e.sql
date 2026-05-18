ALTER TABLE public.bot_handoff_alerts 
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_handoff_alerts_consultant_unresolved 
  ON public.bot_handoff_alerts (consultant_id, created_at DESC) 
  WHERE resolved_at IS NULL;