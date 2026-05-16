
-- Idempotência do webhook
CREATE TABLE IF NOT EXISTS public.webhook_message_dedupe (
  message_id text PRIMARY KEY,
  consultant_id uuid,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_dedupe_processed_at
  ON public.webhook_message_dedupe(processed_at);

ALTER TABLE public.webhook_message_dedupe ENABLE ROW LEVEL SECURITY;

-- Bloqueia tudo via RLS — só service role (edge function) escreve
DROP POLICY IF EXISTS "deny all dedupe" ON public.webhook_message_dedupe;
CREATE POLICY "deny all dedupe"
  ON public.webhook_message_dedupe
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Cleanup automático a cada hora (mantém 24h)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-webhook-dedupe')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-webhook-dedupe');
    PERFORM cron.schedule(
      'cleanup-webhook-dedupe',
      '17 * * * *',
      $job$DELETE FROM public.webhook_message_dedupe WHERE processed_at < now() - interval '24 hours'$job$
    );
  END IF;
END $$;

-- Observabilidade do motor de regras
ALTER TABLE public.bot_flow_rule_fires
  ADD COLUMN IF NOT EXISTS suppressed_reason text;
