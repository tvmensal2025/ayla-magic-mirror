-- Auditoria do Fluxo Padrão (consultant 0c2711ad): corrige cadeia 4→5→6→7→9→10
-- 1) Passo 5 (Valor da conta): Plano B aponta para passo 6 (alinha com transition default)
UPDATE public.bot_flow_steps
   SET fallback = jsonb_set(coalesce(fallback,'{}'::jsonb), '{goto_step_id}', '"bdc7ebb3-db54-446d-89d0-157db0dfe925"'),
       updated_at = now()
 WHERE id = '80188e5f-0c6d-4883-b058-0708efddc056';

-- 2) Passo 6 (Pergutando se pode estar explicando abaixo): vira pergunta que aguarda resposta.
--    - wait_for=reply
--    - captura textual habilitada (required=false ainda permite avanço, mas exige espera)
--    - fallback=repeat (não pular automaticamente)
UPDATE public.bot_flow_steps
   SET wait_for = 'reply',
       captures = '[{"kind":"text","name":"resposta_texto","required":false,"enabled":true}]'::jsonb,
       fallback = '{"mode":"repeat"}'::jsonb,
       updated_at = now()
 WHERE id = 'bdc7ebb3-db54-446d-89d0-157db0dfe925';

-- 3) Passo 7 (Como funciona): remove transição default quebrada para passo apagado.
--    Mantém apenas o Plano B (já aponta para passo 9, que é o próximo ativo).
UPDATE public.bot_flow_steps
   SET transitions = '[]'::jsonb,
       updated_at = now()
 WHERE id = 'a71ba814-e6c2-48aa-bc16-0094e812bc15';

-- 4) Passo 9 (Deu para entender?): remove regra "negacao" quebrada (apontava para passo apagado).
--    Mantém "afirmacao" → passo 10 e Plano B → passo 10.
UPDATE public.bot_flow_steps
   SET transitions = (
         SELECT coalesce(jsonb_agg(t), '[]'::jsonb)
           FROM jsonb_array_elements(transitions) t
          WHERE t->>'trigger_intent' <> 'negacao'
       ),
       updated_at = now()
 WHERE id = '559b8f1b-0630-45b5-aeae-b96cb4d20e9a';

-- 5) Passo 12 (Confirmacao): captura system precisa estar enabled=true para o validador
--    parar de marcar como "cascata morta".
UPDATE public.bot_flow_steps
   SET captures = '[{"kind":"system","name":"cadastro_completo","pipeline":"finalizar_cadastro","required":true,"enabled":true}]'::jsonb,
       updated_at = now()
 WHERE id = '4735aef1-72f0-4a27-8862-61fb9647dae2';