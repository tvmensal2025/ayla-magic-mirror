-- Passo 6 (passo_mpagqq3g) — adiciona default → pos 7
UPDATE bot_flow_steps
SET transitions = '[
  {"trigger_intent":"afirmacao","trigger_phrases":["sim","okay","ok","quero","vamos","pode","claro","manda","beleza"],"goto_step_id":"a71ba814-e6c2-48aa-bc16-0094e812bc15","goto_special":null},
  {"trigger_intent":"default","trigger_phrases":[],"goto_step_id":"a71ba814-e6c2-48aa-bc16-0094e812bc15","goto_special":null}
]'::jsonb
WHERE id = 'bdc7ebb3-db54-446d-89d0-157db0dfe925';

-- Passo 7 (fazenda_solar) — adiciona transição default + corrige texto
UPDATE bot_flow_steps
SET transitions = '[
  {"trigger_intent":"default","trigger_phrases":[],"goto_step_id":"559b8f1b-0630-45b5-aeae-b96cb4d20e9a","goto_special":null}
]'::jsonb,
message_text = 'É simples — vou te mandar um áudio e um vídeo curtos pra ficar mais fácil de entender.'
WHERE id = 'a71ba814-e6c2-48aa-bc16-0094e812bc15';

-- Passo 8 — adiciona default → pos 9 (capture_conta)
UPDATE bot_flow_steps
SET transitions = '[
  {"trigger_intent":"afirmacao","trigger_phrases":["sim","entendi","beleza","vamos","ok","okay","pode","quero","bora","claro","perfeito"],"goto_step_id":"5b318e95-863b-43b8-96b2-d4f55bb9619c","goto_special":null},
  {"trigger_intent":"default","trigger_phrases":[],"goto_step_id":"5b318e95-863b-43b8-96b2-d4f55bb9619c","goto_special":null}
]'::jsonb
WHERE id = '559b8f1b-0630-45b5-aeae-b96cb4d20e9a';