-- Backfill conversation_step com namespace explícito (sys: ou flow:)
-- e adiciona função de lint para detectar inconsistências de fluxo.

-- 1) Backfill: nomes canônicos do bot-flow.ts → prefixo "sys:"
UPDATE public.customers
   SET conversation_step = 'sys:' || conversation_step
 WHERE conversation_step IS NOT NULL
   AND conversation_step NOT LIKE 'sys:%'
   AND conversation_step NOT LIKE 'flow:%'
   AND conversation_step IN (
     'welcome','menu_inicial','pos_video','qualificacao',
     'checkin_pos_video','pitch_conexao_club','duvidas_pos_club','aguardando_humano',
     'aguardando_conta','processando_ocr_conta','confirmando_dados_conta',
     'ask_tipo_documento','aguardando_doc_auto','aguardando_doc_frente','aguardando_doc_verso',
     'confirmando_dados_doc','ask_name','ask_cpf','ask_rg','ask_birth_date',
     'ask_phone_confirm','ask_phone','ask_email','ask_cep','ask_number',
     'ask_complement','ask_installation_number','ask_bill_value',
     'ask_doc_frente_manual','ask_doc_verso_manual','ask_finalizar',
     'finalizando','portal_submitting','aguardando_otp','validando_otp',
     'aguardando_assinatura','complete',
     'editing_conta_menu','editing_conta_nome','editing_conta_endereco',
     'editing_conta_cep','editing_conta_distribuidora','editing_conta_instalacao','editing_conta_valor',
     'editing_doc_menu','editing_doc_nome','editing_doc_cpf','editing_doc_rg',
     'editing_doc_nascimento','editing_doc_pai','editing_doc_mae'
   );

-- 2) Backfill: UUIDs e passo_<ts> → prefixo "flow:"
UPDATE public.customers
   SET conversation_step = 'flow:' || conversation_step
 WHERE conversation_step IS NOT NULL
   AND conversation_step NOT LIKE 'sys:%'
   AND conversation_step NOT LIKE 'flow:%'
   AND (
     conversation_step ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR conversation_step LIKE 'passo_%'
   );

-- 3) Qualquer resto (valor desconhecido) → fallback seguro: sys:welcome
UPDATE public.customers
   SET conversation_step = 'sys:welcome'
 WHERE conversation_step IS NOT NULL
   AND conversation_step NOT LIKE 'sys:%'
   AND conversation_step NOT LIKE 'flow:%';

-- 4) Função de lint para diagnóstico
CREATE OR REPLACE FUNCTION public.lint_bot_flow_consistency(_consultant_id uuid DEFAULT NULL)
RETURNS TABLE(
  category text,
  severity text,
  detail text,
  consultant_id uuid,
  customer_id uuid,
  step text,
  occurrences bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- A) Customers ainda sem prefixo
  SELECT 'missing_prefix'::text, 'high'::text,
         'conversation_step sem prefixo sys:/flow:',
         c.consultant_id, c.id, c.conversation_step, 1::bigint
    FROM public.customers c
   WHERE c.conversation_step IS NOT NULL
     AND c.conversation_step NOT LIKE 'sys:%'
     AND c.conversation_step NOT LIKE 'flow:%'
     AND (_consultant_id IS NULL OR c.consultant_id = _consultant_id)

  UNION ALL
  -- B) flow:<id> que aponta pra step inexistente
  SELECT 'orphan_flow_step'::text, 'high'::text,
         'flow:<id> não existe em bot_flow_steps',
         c.consultant_id, c.id, c.conversation_step, 1::bigint
    FROM public.customers c
   WHERE c.conversation_step LIKE 'flow:%'
     AND NOT EXISTS (
       SELECT 1 FROM public.bot_flow_steps s
        WHERE s.id::text = substring(c.conversation_step from 6)
     )
     AND (_consultant_id IS NULL OR c.consultant_id = _consultant_id)

  UNION ALL
  -- C) Customers parados no mesmo step há >5 mensagens (loop suspeito)
  SELECT 'possible_loop'::text, 'medium'::text,
         'mais de 5 mensagens no mesmo step',
         c.consultant_id, c.id, c.conversation_step,
         (SELECT count(*) FROM public.conversations cv
           WHERE cv.customer_id = c.id
             AND cv.conversation_step = c.conversation_step
             AND cv.created_at > now() - interval '24 hours')
    FROM public.customers c
   WHERE c.conversation_step IS NOT NULL
     AND (_consultant_id IS NULL OR c.consultant_id = _consultant_id)
     AND (
       SELECT count(*) FROM public.conversations cv
        WHERE cv.customer_id = c.id
          AND cv.conversation_step = c.conversation_step
          AND cv.created_at > now() - interval '24 hours'
     ) > 5;
$$;

GRANT EXECUTE ON FUNCTION public.lint_bot_flow_consistency(uuid) TO authenticated;