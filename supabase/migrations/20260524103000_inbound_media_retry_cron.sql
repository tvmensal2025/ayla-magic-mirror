-- ============================================================================
-- Schedule inbound-media-retry-cron via pg_cron.
-- Task 16 do whatsapp-flow-reliability-fix.
--
-- O cron pg_cron tem granularidade mínima de 1 minuto. A spec pede 30s, mas
-- 1 minuto cobre o caso de uso (uploads que falharam aguardam pelo menos
-- 1 minuto antes de retry, conforme BACKOFF_MS no Edge Function).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotente: remove job antigo antes de recriar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inbound-media-retry-cron-1min') THEN
    PERFORM cron.unschedule('inbound-media-retry-cron-1min');
  END IF;
END $$;

SELECT cron.schedule(
  'inbound-media-retry-cron-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/inbound-media-retry-cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
