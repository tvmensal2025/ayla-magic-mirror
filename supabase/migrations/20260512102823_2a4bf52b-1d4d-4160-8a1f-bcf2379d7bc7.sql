
-- Garante extensões
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento anterior (se houver) e recria
DO $$ BEGIN
  PERFORM cron.unschedule('fb-sync-audiences-daily');
EXCEPTION WHEN others THEN NULL;
END $$;

SELECT cron.schedule(
  'fb-sync-audiences-daily',
  '0 7 * * *', -- 07:00 UTC = 04:00 BRT
  $$
  SELECT net.http_post(
    url := 'https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/facebook-sync-audiences',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo'
    ),
    body := '{"scope":"platform"}'::jsonb
  );
  $$
);
