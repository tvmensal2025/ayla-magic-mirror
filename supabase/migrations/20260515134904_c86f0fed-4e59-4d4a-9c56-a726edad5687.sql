
-- ─── 1. Customer columns: handoff + follow-up ─────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS bot_paused_until timestamptz,
  ADD COLUMN IF NOT EXISTS bot_paused_reason text,
  ADD COLUMN IF NOT EXISTS last_bot_interaction_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_followup_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_customers_bot_paused_until
  ON public.customers (bot_paused_until)
  WHERE bot_paused_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_followup_candidates
  ON public.customers (last_bot_interaction_at, followup_count)
  WHERE bot_paused_until IS NULL;

-- ─── 2. Message buffer (debounce) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_message_buffer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  consultant_id uuid NOT NULL,
  customer_id uuid,
  message_id text,
  message_text text,
  remote_jid text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_msg_buffer_phone_pending
  ON public.whatsapp_message_buffer (phone, consultant_id, created_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.whatsapp_message_buffer ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages buffer" ON public.whatsapp_message_buffer;
CREATE POLICY "Admins read buffer" ON public.whatsapp_message_buffer
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ─── 3. A/B testing results ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bot_message_ab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL,
  step_key text NOT NULL,
  variant text NOT NULL DEFAULT 'default',
  consultant_id uuid,
  sent_count bigint NOT NULL DEFAULT 0,
  replied_count bigint NOT NULL DEFAULT 0,
  advanced_count bigint NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ab_results_key
  ON public.bot_message_ab_results (template_key, step_key, variant, COALESCE(consultant_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE public.bot_message_ab_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read ab results" ON public.bot_message_ab_results;
CREATE POLICY "Authenticated read ab results" ON public.bot_message_ab_results
  FOR SELECT TO authenticated
  USING (consultant_id IS NULL OR consultant_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- ─── 4. Handoff alerts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bot_handoff_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  consultant_id uuid NOT NULL,
  phone text,
  reason text,
  user_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

CREATE INDEX IF NOT EXISTS idx_handoff_unresolved
  ON public.bot_handoff_alerts (consultant_id, created_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.bot_handoff_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads handoffs" ON public.bot_handoff_alerts;
CREATE POLICY "Owner reads handoffs" ON public.bot_handoff_alerts
  FOR SELECT TO authenticated
  USING (consultant_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Owner updates handoffs" ON public.bot_handoff_alerts;
CREATE POLICY "Owner updates handoffs" ON public.bot_handoff_alerts
  FOR UPDATE TO authenticated
  USING (consultant_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (consultant_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- ─── 5. RPC: A/B counters (atomic upsert) ─────────────────────────
CREATE OR REPLACE FUNCTION public.increment_ab_metric(
  p_template_key text,
  p_step_key text,
  p_variant text,
  p_consultant_id uuid,
  p_metric text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_metric NOT IN ('sent', 'replied', 'advanced') THEN
    RAISE EXCEPTION 'invalid metric %', p_metric;
  END IF;

  INSERT INTO public.bot_message_ab_results (template_key, step_key, variant, consultant_id, sent_count, replied_count, advanced_count, last_sent_at)
  VALUES (
    p_template_key, p_step_key, p_variant, p_consultant_id,
    CASE WHEN p_metric = 'sent' THEN 1 ELSE 0 END,
    CASE WHEN p_metric = 'replied' THEN 1 ELSE 0 END,
    CASE WHEN p_metric = 'advanced' THEN 1 ELSE 0 END,
    CASE WHEN p_metric = 'sent' THEN now() ELSE NULL END
  )
  ON CONFLICT (template_key, step_key, variant, COALESCE(consultant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET
    sent_count = bot_message_ab_results.sent_count + (CASE WHEN p_metric = 'sent' THEN 1 ELSE 0 END),
    replied_count = bot_message_ab_results.replied_count + (CASE WHEN p_metric = 'replied' THEN 1 ELSE 0 END),
    advanced_count = bot_message_ab_results.advanced_count + (CASE WHEN p_metric = 'advanced' THEN 1 ELSE 0 END),
    last_sent_at = COALESCE(EXCLUDED.last_sent_at, bot_message_ab_results.last_sent_at),
    updated_at = now();
END;
$$;

-- ─── 6. Cleanup cron jobs ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Limpa dedup > 7 dias e buffer processado > 1 dia
CREATE OR REPLACE FUNCTION public.cleanup_webhook_artifacts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.webhook_message_dedup WHERE created_at < now() - interval '7 days';
  DELETE FROM public.whatsapp_message_buffer WHERE processed_at IS NOT NULL AND processed_at < now() - interval '1 day';
END;
$$;

-- Remove job antigo se existir e recria
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-webhook-artifacts');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-webhook-artifacts',
  '0 3 * * *',
  $$ SELECT public.cleanup_webhook_artifacts(); $$
);
