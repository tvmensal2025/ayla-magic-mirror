-- Travas anti-erro nos áudios da Camila
ALTER TABLE public.ai_agent_slots ADD COLUMN IF NOT EXISTS is_testing boolean NOT NULL DEFAULT false;
ALTER TABLE public.ai_slot_dispatch_log ADD COLUMN IF NOT EXISTS dispatch_status text NOT NULL DEFAULT 'sent';
-- valores possíveis: sent | blocked_cooldown | blocked_global_limit | blocked_invalid_slot | testing_only
CREATE INDEX IF NOT EXISTS idx_slot_log_customer_sent ON public.ai_slot_dispatch_log(customer_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_slot_log_consultant_sent ON public.ai_slot_dispatch_log(consultant_id, sent_at DESC);