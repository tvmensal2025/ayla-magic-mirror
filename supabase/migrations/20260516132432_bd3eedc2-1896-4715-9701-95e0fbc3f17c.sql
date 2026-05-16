-- 1) Passo 2 (valor da conta): adicionar transição explícita "informou valor" -> passo 3
UPDATE public.bot_flow_steps
SET transitions = '[
  {"trigger_intent":"valor_brl","trigger_phrases":[],"goto_step_id":"80188e5f-0c6d-4883-b058-0708efddc056","goto_special":null},
  {"trigger_intent":"informou_valor","trigger_phrases":[],"goto_step_id":"80188e5f-0c6d-4883-b058-0708efddc056","goto_special":null},
  {"trigger_intent":"palavra_chave","trigger_phrases":["como funciona","me explica","quero entender"],"goto_step_id":"bd0fd2f0-a1f1-4b02-bf35-f129d323f4b1","goto_special":null}
]'::jsonb
WHERE id = '3e7fb4cd-33a7-4854-aec7-4570b04456e9';

-- 2) Passo 5 ("Deu para entender? Vamos fazer cadastro?"): trocar wait_for=media -> reply
--    e adicionar transição explícita: sim -> capture_conta (passo 6)
UPDATE public.bot_flow_steps
SET wait_for = 'reply',
    transitions = '[
      {"trigger_intent":"afirmacao","trigger_phrases":["sim","vamos","bora","quero","pode","ok","claro","beleza"],"goto_step_id":"5b318e95-863b-43b8-96b2-d4f55bb9619c","goto_special":null},
      {"trigger_intent":"quer_cadastrar","trigger_phrases":["cadastrar","quero cadastrar"],"goto_step_id":null,"goto_special":"cadastro"},
      {"trigger_intent":"negacao","trigger_phrases":["não","nao","depois","agora não"],"goto_step_id":null,"goto_special":"repeat"}
    ]'::jsonb,
    fallback = '{"mode":"repeat"}'::jsonb
WHERE id = '559b8f1b-0630-45b5-aeae-b96cb4d20e9a';

-- 3) Desativar passos finais vazios (sem texto, sem mídia, sem função real)
UPDATE public.bot_flow_steps
SET is_active = false
WHERE id IN (
  '6df8cbb0-2ac7-4c5c-8a39-94c770d25738',  -- pos 15 "Novo passo"
  '041bd781-b70b-45b3-bf45-f9f7383874dc'   -- pos 16 "Regra 1"
);

-- 4) Destravar leads de teste que ficaram parados no passo do valor com valor já capturado
UPDATE public.customers
SET conversation_step = 'flow:80188e5f-0c6d-4883-b058-0708efddc056',
    previous_conversation_step = NULL,
    last_rule_id = NULL,
    updated_at = now()
WHERE consultant_id = '0c2711ad-4836-41e6-afba-edd94f698ae3'
  AND conversation_step = 'flow:3e7fb4cd-33a7-4854-aec7-4570b04456e9'
  AND electricity_bill_value IS NOT NULL;

-- 5) Limpar dedupe de mídia desses leads para poderem receber as mídias de novo no próximo teste
DELETE FROM public.ai_slot_dispatch_log
WHERE customer_id IN (
  SELECT id FROM public.customers
  WHERE consultant_id = '0c2711ad-4836-41e6-afba-edd94f698ae3'
);

-- 6) Limpar webhook dedupe antigo (segurança extra para reteste)
DELETE FROM public.webhook_message_dedupe
WHERE processed_at < now() - interval '1 hour';