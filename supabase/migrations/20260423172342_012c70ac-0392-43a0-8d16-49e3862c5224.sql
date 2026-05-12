-- 1) Backfill: usa updated_at como base para não disparar rescue para todos
UPDATE public.customers
SET last_bot_reply_at = updated_at
WHERE last_bot_reply_at IS NULL;

-- 2) Agenda o cron (verifica se pg_cron está habilitado primeiro)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove job anterior se existir
    PERFORM cron.unschedule('bot-stuck-recovery-30min')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bot-stuck-recovery-30min');

    PERFORM cron.schedule(
      'bot-stuck-recovery-30min',
      '*/30 * * * *',
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