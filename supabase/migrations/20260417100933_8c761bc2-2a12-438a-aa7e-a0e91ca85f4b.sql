-- Agenda o job diário de recuperação de leads presos em awaiting_otp.
-- Roda às 12:00 UTC (09:00 BRT). Usa a anon key pública do projeto.
do $$
begin
  -- Remove agendamento anterior se existir (idempotente)
  perform cron.unschedule('recover-stuck-otp-daily')
  where exists (select 1 from cron.job where jobname = 'recover-stuck-otp-daily');
end $$;

select cron.schedule(
  'recover-stuck-otp-daily',
  '0 12 * * *',
  $$
  select net.http_post(
    url:='https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/recover-stuck-otp',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo"}'::jsonb,
    body:='{"trigger":"cron"}'::jsonb
  ) as request_id;
  $$
);