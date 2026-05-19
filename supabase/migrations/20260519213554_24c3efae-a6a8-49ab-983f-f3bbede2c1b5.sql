-- Fix variant B of Rafael's flow with same corrections applied to variant A
-- Flow: 477f8968-1344-4252-b822-8912fdbdb538

-- Pos 6 (94e01f57): add default fallback → 674d90a5 (Como funciona)
UPDATE bot_flow_steps
SET transitions = '[
  {"trigger_intent":"afirmacao","goto_step_id":"674d90a5-38b4-4931-a8a3-eac8e743ce7a","trigger_phrases":["ok","okay","pode","sim","claro","manda","beleza"]},
  {"trigger_intent":"default","goto_step_id":"674d90a5-38b4-4931-a8a3-eac8e743ce7a","trigger_phrases":[]}
]'::jsonb
WHERE id = '94e01f57-b841-455f-8777-6bb6d3a94674';

-- Pos 7 (e0f1de51 "Deu para entender?"): add default fallback → 5210901c (capture_conta)
UPDATE bot_flow_steps
SET transitions = '[
  {"trigger_intent":"afirmacao","goto_step_id":"5210901c-03e6-4900-b969-5a9a2c4bcc13","trigger_phrases":["sim","entendi","beleza","vamos","ok","okay","pode","quero","bora","claro","perfeito"]},
  {"trigger_intent":"default","goto_step_id":"5210901c-03e6-4900-b969-5a9a2c4bcc13","trigger_phrases":[]}
]'::jsonb
WHERE id = 'e0f1de51-36c5-4669-9ffd-95c1423e5008';

-- Pos 8 (674d90a5 "Como funciona"): fix truncated text + add explicit default transition → pos 9 (capture_conta 5210901c)
UPDATE bot_flow_steps
SET message_text = 'É simples — vou te mandar um áudio e um vídeo curtos pra ficar mais fácil de entender.',
    transitions = '[
      {"trigger_intent":"default","goto_step_id":"5210901c-03e6-4900-b969-5a9a2c4bcc13","trigger_phrases":[]}
    ]'::jsonb
WHERE id = '674d90a5-38b4-4931-a8a3-eac8e743ce7a';