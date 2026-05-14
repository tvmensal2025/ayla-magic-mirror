
SELECT cron.schedule(
  'ai-daily-digest-09brt',
  '0 12 * * *',
  $$select net.http_post(
    url:='https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/ai-daily-digest',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo"}'::jsonb,
    body:='{}'::jsonb
  );$$
);

SELECT cron.schedule(
  'ai-cpl-watchdog-4h',
  '0 */4 * * *',
  $$select net.http_post(
    url:='https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/ai-cpl-watchdog',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo"}'::jsonb,
    body:='{}'::jsonb
  );$$
);
