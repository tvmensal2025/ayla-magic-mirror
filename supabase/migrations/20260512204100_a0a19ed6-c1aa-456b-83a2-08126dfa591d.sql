SELECT cron.schedule(
  'ai-followup-cron-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/ai-followup-cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo"}'::jsonb,
    body := jsonb_build_object('time', now())
  ) AS request_id;
  $$
);

CREATE INDEX IF NOT EXISTS idx_customers_next_followup_at
  ON public.customers (next_followup_at)
  WHERE next_followup_at IS NOT NULL;