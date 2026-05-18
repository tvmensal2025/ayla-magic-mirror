
-- Pos 2: Nome -> pos 3 Boas Vindas
UPDATE public.bot_flow_steps SET
  transitions = '[{"trigger_intent":"default","trigger_phrases":[],"goto_step_id":"6226f6f3-e655-4cc9-af20-d8c28c998160","goto_special":null}]'::jsonb,
  text_delay_ms = 1500
WHERE id = '33be68c1-44b6-4de1-8a1c-aa3758c4cdfa';

-- Pos 3: Boas Vindas -> pos 4 Qual valor (delay 2000)
UPDATE public.bot_flow_steps SET
  transitions = '[{"trigger_intent":"default","trigger_phrases":[],"goto_step_id":"3e7fb4cd-33a7-4854-aec7-4570b04456e9","goto_special":null}]'::jsonb,
  text_delay_ms = 2000
WHERE id = '6226f6f3-e655-4cc9-af20-d8c28c998160';

-- Pos 4: Qual valor -> pos 5 Valor da conta
UPDATE public.bot_flow_steps SET
  transitions = '[{"trigger_intent":"default","trigger_phrases":[],"goto_step_id":"80188e5f-0c6d-4883-b058-0708efddc056","goto_special":null}]'::jsonb,
  text_delay_ms = 2500
WHERE id = '3e7fb4cd-33a7-4854-aec7-4570b04456e9';

-- Pos 5: Valor da conta -> pos 6 Perguntando (antes pulava p/ pos 7)
UPDATE public.bot_flow_steps SET
  transitions = '[{"trigger_intent":"default","trigger_phrases":[],"goto_step_id":"bdc7ebb3-db54-446d-89d0-157db0dfe925","goto_special":null}]'::jsonb,
  text_delay_ms = 2500
WHERE id = '80188e5f-0c6d-4883-b058-0708efddc056';

-- Pos 6: Perguntando -> pos 7 Como funciona (default p/ qualquer resposta)
UPDATE public.bot_flow_steps SET
  transitions = '[{"trigger_intent":"afirmacao","trigger_phrases":["ok","okay","pode","sim","claro","manda","beleza"],"goto_step_id":"a71ba814-e6c2-48aa-bc16-0094e812bc15","goto_special":null},{"trigger_intent":"default","trigger_phrases":[],"goto_step_id":"a71ba814-e6c2-48aa-bc16-0094e812bc15","goto_special":null}]'::jsonb,
  text_delay_ms = 2000
WHERE id = 'bdc7ebb3-db54-446d-89d0-157db0dfe925';

-- Pos 7: Como funciona -> pos 8 Quebra de objeção (delay 3000, antes era 60000)
UPDATE public.bot_flow_steps SET
  transitions = '[{"trigger_intent":"default","trigger_phrases":[],"goto_step_id":"c495e1b0-0aeb-40b0-a0f0-dc9d55ff696e","goto_special":null}]'::jsonb,
  text_delay_ms = 3000
WHERE id = 'a71ba814-e6c2-48aa-bc16-0094e812bc15';

-- Pos 8: Quebra de objeção -> pos 9 Deu p/ entender (delay 4000)
UPDATE public.bot_flow_steps SET
  transitions = '[{"trigger_intent":"default","trigger_phrases":[],"goto_step_id":"559b8f1b-0630-45b5-aeae-b96cb4d20e9a","goto_special":null}]'::jsonb,
  text_delay_ms = 4000
WHERE id = 'c495e1b0-0aeb-40b0-a0f0-dc9d55ff696e';

-- Pos 9: Deu p/ entender -> pos 10 Conta (sim) | pos 8 Quebra (não) | delay 8000
UPDATE public.bot_flow_steps SET
  transitions = '[{"trigger_intent":"afirmacao","trigger_phrases":["sim","entendi","beleza","vamos","ok","okay","pode","quero","bora","claro","perfeito"],"goto_step_id":"5b318e95-863b-43b8-96b2-d4f55bb9619c","goto_special":null},{"trigger_intent":"negacao","trigger_phrases":["nao","não","nao entendi","não entendi","duvida","dúvida","tenho duvida","tenho dúvida","explica","explica de novo"],"goto_step_id":"c495e1b0-0aeb-40b0-a0f0-dc9d55ff696e","goto_special":null},{"trigger_intent":"default","trigger_phrases":[],"goto_step_id":"5b318e95-863b-43b8-96b2-d4f55bb9619c","goto_special":null}]'::jsonb,
  text_delay_ms = 8000
WHERE id = '559b8f1b-0630-45b5-aeae-b96cb4d20e9a';

-- Pos 10: Conta energia -> pos 11 Cadastro doc
UPDATE public.bot_flow_steps SET
  transitions = '[{"trigger_intent":"default","trigger_phrases":[],"goto_step_id":"bd0fd2f0-a1f1-4b02-bf35-f129d323f4b1","goto_special":null}]'::jsonb,
  text_delay_ms = 2000
WHERE id = '5b318e95-863b-43b8-96b2-d4f55bb9619c';

-- Pos 11: Cadastro doc -> pos 12 Confirmação
UPDATE public.bot_flow_steps SET
  transitions = '[{"trigger_intent":"default","trigger_phrases":[],"goto_step_id":"4735aef1-72f0-4a27-8862-61fb9647dae2","goto_special":null}]'::jsonb,
  text_delay_ms = 1500
WHERE id = 'bd0fd2f0-a1f1-4b02-bf35-f129d323f4b1';

-- Pos 12: Confirmação (finalizar) — sem transição, mantém delay 2500
UPDATE public.bot_flow_steps SET
  text_delay_ms = 2500
WHERE id = '4735aef1-72f0-4a27-8862-61fb9647dae2';
