-- Fix Fluxo B do Rafael Ferreira
-- B1: pos6 (94e01f57) deve ir para pos7 (e0f1de51), não pos8 (674d90a5)
UPDATE public.bot_flow_steps
SET transitions = '[
  {"goto_step_id":"e0f1de51-36c5-4669-9ffd-95c1423e5008","trigger_intent":"afirmacao","trigger_phrases":["ok","okay","pode","sim","claro","manda","beleza"]},
  {"goto_step_id":"e0f1de51-36c5-4669-9ffd-95c1423e5008","trigger_intent":"default","trigger_phrases":[]}
]'::jsonb,
updated_at = now()
WHERE id = '94e01f57-b841-455f-8777-6bb6d3a94674';

-- B2: pos7 "Como funciona" deve ter slot fazenda_solar
UPDATE public.bot_flow_steps
SET slot_key = 'fazenda_solar', updated_at = now()
WHERE id = 'e0f1de51-36c5-4669-9ffd-95c1423e5008';

-- B3: pos8 "Convite" não deve ter slot fazenda_solar
UPDATE public.bot_flow_steps
SET slot_key = NULL, updated_at = now()
WHERE id = '674d90a5-38b4-4931-a8a3-eac8e743ce7a';