
-- 1) Reschedule bot-stuck-recovery: 30min → 5min para resgate ativo mais agressivo
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove ambos jobs antigos se existirem
    PERFORM cron.unschedule('bot-stuck-recovery-30min')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bot-stuck-recovery-30min');
    PERFORM cron.unschedule('bot-stuck-recovery-5min')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bot-stuck-recovery-5min');

    PERFORM cron.schedule(
      'bot-stuck-recovery-5min',
      '*/5 * * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/bot-stuck-recovery',
          headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo"}'::jsonb,
          body := '{}'::jsonb
        ) AS request_id;
      $cron$
    );
  END IF;
END $$;

-- 2) Adiciona campo 'rescue_count' para controle dos 3 estágios de resgate
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS rescue_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_rescue_at timestamp with time zone;

-- 3) Índice para consulta de leads travados (usado pelo widget e cron)
CREATE INDEX IF NOT EXISTS idx_customers_stuck_leads
  ON public.customers (last_bot_reply_at, status)
  WHERE last_bot_reply_at IS NOT NULL;

-- 4) Fix imediato JOSE ALVES: completa email com fallback e re-enfileira
UPDATE public.customers
SET email = COALESCE(NULLIF(email, ''), phone_whatsapp || '@lead.igreen'),
    conversation_step = 'ask_cep',
    last_bot_reply_at = now() - interval '6 minutes'
WHERE id = 'fbd0e3d1-0000-0000-0000-000000000000'::uuid
   OR (name ILIKE 'JOSE ALVES%' AND conversation_step = 'ask_email');

-- 5) Remove leads "lixo" criados a partir de auto-mensagem (phone == instance phone)
DELETE FROM public.customers c
WHERE c.created_at > now() - interval '7 days'
  AND EXISTS (
    SELECT 1 FROM public.whatsapp_instances w
    WHERE w.consultant_id = c.consultant_id
      AND replace(replace(w.connected_phone, '+', ''), ' ', '') = c.phone_whatsapp
  )
  AND COALESCE(c.name, '') = ''
  AND c.conversation_step IN ('welcome','menu_inicial');
