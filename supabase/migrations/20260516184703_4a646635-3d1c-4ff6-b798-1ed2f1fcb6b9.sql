
-- 1) Ordenação universal: texto, vídeo, áudio, imagem
UPDATE public.bot_flow_steps s
   SET media_order = '["text","video","audio","image"]'::jsonb
  FROM public.bot_flows f
 WHERE s.flow_id = f.id
   AND f.consultant_id = '0c2711ad-4836-41e6-afba-edd94f698ae3'
   AND f.is_active = true;

-- 2) Encadeamento sequencial 1→2→3→4→5 (step 5 já tem transitions específicas), 6→7→8
-- Passo 1 → 2
UPDATE public.bot_flow_steps SET transitions = jsonb_build_array(
  jsonb_build_object('trigger_intent','default','trigger_phrases','[]'::jsonb,'goto_step_id','3e7fb4cd-33a7-4854-aec7-4570b04456e9','goto_special',NULL)
) WHERE id = '6226f6f3-e655-4cc9-af20-d8c28c998160';

-- Passo 2 → 3
UPDATE public.bot_flow_steps SET transitions = jsonb_build_array(
  jsonb_build_object('trigger_intent','default','trigger_phrases','[]'::jsonb,'goto_step_id','80188e5f-0c6d-4883-b058-0708efddc056','goto_special',NULL)
) WHERE id = '3e7fb4cd-33a7-4854-aec7-4570b04456e9';

-- Passo 3 → 4
UPDATE public.bot_flow_steps SET transitions = jsonb_build_array(
  jsonb_build_object('trigger_intent','default','trigger_phrases','[]'::jsonb,'goto_step_id','a71ba814-e6c2-48aa-bc16-0094e812bc15','goto_special',NULL)
) WHERE id = '80188e5f-0c6d-4883-b058-0708efddc056';

-- Passo 4 → 5
UPDATE public.bot_flow_steps SET transitions = jsonb_build_array(
  jsonb_build_object('trigger_intent','default','trigger_phrases','[]'::jsonb,'goto_step_id','559b8f1b-0630-45b5-aeae-b96cb4d20e9a','goto_special',NULL)
) WHERE id = 'a71ba814-e6c2-48aa-bc16-0094e812bc15';

-- Passo 6 → 7
UPDATE public.bot_flow_steps SET transitions = jsonb_build_array(
  jsonb_build_object('trigger_intent','default','trigger_phrases','[]'::jsonb,'goto_step_id','bd0fd2f0-a1f1-4b02-bf35-f129d323f4b1','goto_special',NULL)
) WHERE id = '5b318e95-863b-43b8-96b2-d4f55bb9619c';

-- Passo 7 → 8
UPDATE public.bot_flow_steps SET transitions = jsonb_build_array(
  jsonb_build_object('trigger_intent','default','trigger_phrases','[]'::jsonb,'goto_step_id','4735aef1-72f0-4a27-8862-61fb9647dae2','goto_special',NULL)
) WHERE id = 'bd0fd2f0-a1f1-4b02-bf35-f129d323f4b1';

-- 3) Limpar dispatch log do contato de teste Rafael Ferreira Dias
DELETE FROM public.ai_slot_dispatch_log WHERE customer_id = 'deebfdf9-0917-47f3-aab7-01b6aa9a7ccc';
