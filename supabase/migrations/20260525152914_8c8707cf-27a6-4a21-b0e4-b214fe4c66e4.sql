-- Fix 3a: adiciona success_goto_step_id nos passos capture_* do Fluxo D
-- Engine usa esse campo (quando presente) para roteamento explícito pós-OCR-sucesso,
-- impedindo cascade caótico para o "próximo por position".

UPDATE public.bot_flow_steps
SET fallback = coalesce(fallback, '{}'::jsonb)
              || jsonb_build_object('success_goto_step_id', '4df1f90a-0248-4df0-9473-4c910f1b22bd')
WHERE id = '279d3926-5363-403f-af5d-5201e2014598'; -- d_pedir_conta → d_resultado

UPDATE public.bot_flow_steps
SET fallback = coalesce(fallback, '{}'::jsonb)
              || jsonb_build_object('success_goto_step_id', '9f2d47d4-3f7d-4871-a00a-929314a1550f')
WHERE id = '58f0a7e2-16ce-4ee2-ad07-1466ce7e9f1f'; -- d_pedir_documento → d_finalizar
