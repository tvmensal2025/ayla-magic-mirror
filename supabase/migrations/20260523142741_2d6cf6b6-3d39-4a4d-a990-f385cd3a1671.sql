-- P3: d_como_funciona — trocar handoff por goto_special
UPDATE bot_flow_steps SET
  transitions = '[
    {"trigger_phrases":["📸 Quero simular","Quero simular","simular","1"],"goto_step_id":"279d3926-5363-403f-af5d-5201e2014598"},
    {"trigger_phrases":["🤔 Ainda tenho dúvida","Ainda tenho dúvida","duvida","dúvida","2"],"goto_step_id":"38c0d101-6492-4b1e-8229-c676c804161a"},
    {"trigger_phrases":["👨 Falar com Rafael","Falar com Rafael","humano","atendente","3"],"goto_special":"humano"}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'c87d76f8-f4d2-48ec-ac08-4ef0b3c92834';

-- P2: d_duvidas — adicionar botões + transitions
UPDATE bot_flow_steps SET
  captures = '[{"field":"_buttons","enabled":true,"value":[
    {"id":"simular","title":"📸 Quero simular"},
    {"id":"humano","title":"👨 Falar com Rafael"}
  ]}]'::jsonb,
  transitions = '[
    {"trigger_phrases":["📸 Quero simular","Quero simular","simular","1"],"goto_step_id":"279d3926-5363-403f-af5d-5201e2014598"},
    {"trigger_phrases":["👨 Falar com Rafael","Falar com Rafael","humano","atendente","2"],"goto_special":"humano"}
  ]'::jsonb,
  updated_at = now()
WHERE id = '38c0d101-6492-4b1e-8229-c676c804161a';