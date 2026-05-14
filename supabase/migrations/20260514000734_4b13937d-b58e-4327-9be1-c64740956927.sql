ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS ai_rescue_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_last_rescue_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_customers_sales_phase_updated
  ON public.customers (sales_phase, updated_at)
  WHERE bot_paused = false;

-- pg_cron + pg_net for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule ai-closer-cron every 10 minutes
SELECT cron.schedule(
  'ai-closer-cron-every-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/ai-closer-cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);