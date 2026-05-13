SELECT cron.schedule(
  'ad-competitor-scraper-weekly',
  '0 6 * * 1',
  $$select net.http_post(
    url:='https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/ad-competitor-scraper',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo"}'::jsonb,
    body:='{}'::jsonb
  );$$
);

SELECT cron.schedule(
  'ad-creative-learner-daily',
  '0 7 * * *',
  $$select net.http_post(
    url:='https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/ad-creative-learner',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo"}'::jsonb,
    body:='{}'::jsonb
  );$$
);

SELECT cron.schedule(
  'facebook-creative-rotator-daily',
  '0 8 * * *',
  $$select net.http_post(
    url:='https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/facebook-creative-rotator',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo"}'::jsonb,
    body:='{}'::jsonb
  );$$
);