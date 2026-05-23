UPDATE bot_flow_steps
SET 
  captures = '[{"field":"_buttons","enabled":true,"value":[
    {"id":"simular","title":"📸 Quero simular"},
    {"id":"duvida","title":"🤔 Ainda tenho dúvida"},
    {"id":"humano","title":"👨 Falar com Rafael"}
  ]}]'::jsonb,
  transitions = '[
    {"trigger_phrases":["📸 Quero simular","Quero simular","simular","1"],"goto_step_id":"279d3926-5363-403f-af5d-5201e2014598"},
    {"trigger_phrases":["🤔 Ainda tenho dúvida","Ainda tenho dúvida","duvida","dúvida","2"],"goto_step_id":"38c0d101-6492-4b1e-8229-c676c804161a"},
    {"trigger_phrases":["👨 Falar com Rafael","Falar com Rafael","humano","atendente","3"],"goto_step_id":"7a85cc99-6fdf-4e5c-8752-d51b92e9bd09"}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'c87d76f8-f4d2-48ec-ac08-4ef0b3c92834';