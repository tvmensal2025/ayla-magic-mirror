-- Inserir d_pedir_email e d_confirmar_telefone no fluxo D, entre documento e finalizar
-- Renumerar duvidas/handoff/finalizar para posições 8/9/10

UPDATE bot_flow_steps SET position = 10 WHERE id = '9f2d47d4-3f7d-4871-a00a-929314a1550f';
UPDATE bot_flow_steps SET position = 9  WHERE id = '7a85cc99-6fdf-4e5c-8752-d51b92e9bd09';
UPDATE bot_flow_steps SET position = 8  WHERE id = '38c0d101-6492-4b1e-8229-c676c804161a';

INSERT INTO bot_flow_steps (id, flow_id, position, step_key, step_type, message_text, captures, transitions, fallback, is_active)
VALUES
  (
    'b1e1a001-d001-4001-9001-d00d00d00001',
    '320bf22c-e383-4f53-a3c0-b88b89b02558',
    6,
    'd_pedir_email',
    'capture_email',
    E'Falta pouco, *{{nome}}*! 📧\n\nMe passa seu *e-mail* pra finalizar o cadastro no portal da iGreen.',
    '[{"kind":"text","name":"email","required":true,"retry_text":"Esse e-mail parece inválido. Pode reenviar?"}]'::jsonb,
    '[]'::jsonb,
    '{"action":"retry","retry_text":"Pode me mandar seu e-mail novamente?","then":"humano"}'::jsonb,
    true
  ),
  (
    'b1e1a002-d002-4002-9002-d00d00d00002',
    '320bf22c-e383-4f53-a3c0-b88b89b02558',
    7,
    'd_confirmar_telefone',
    'confirm_phone',
    E'Confirma seu *telefone de contato*? 📱\n\nSe for o mesmo deste WhatsApp, responde *Sim*. Caso contrário, envia o novo número com DDD.',
    '[{"kind":"text","name":"telefone","required":true}]'::jsonb,
    '[]'::jsonb,
    '{"action":"retry","retry_text":"Pode confirmar o telefone novamente?","then":"humano"}'::jsonb,
    true
  );

-- pg_cron a cada 1 min para ocr-review-timeout
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'ocr-review-timeout-every-min';

SELECT cron.schedule(
  'ocr-review-timeout-every-min',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/ocr-review-timeout',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);