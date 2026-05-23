UPDATE public.bot_flow_steps
SET slot_key = 'esclarecer_duvidas',
    media_order = '["text"]'::jsonb
WHERE flow_id = '320bf22c-e383-4f53-a3c0-b88b89b02558'
  AND step_key = 'd_duvidas';