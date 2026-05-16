WITH targets AS (
  SELECT id FROM customers
  WHERE conversation_step IS NOT NULL
    AND status NOT IN ('active','approved','cancelled','complete')
    AND conversation_step NOT IN (
      'aguardando_conta','processando_ocr_conta','confirmando_dados_conta',
      'ask_tipo_documento','aguardando_doc_auto','aguardando_doc_frente','aguardando_doc_verso',
      'confirmando_dados_doc','ask_name','ask_cpf','ask_rg','ask_birth_date',
      'ask_phone_confirm','ask_phone','ask_email','ask_cep','ask_number',
      'ask_complement','ask_installation_number','ask_bill_value',
      'ask_doc_frente_manual','ask_doc_verso_manual','ask_finalizar',
      'finalizando','portal_submitting','aguardando_otp','validando_otp',
      'aguardando_assinatura','complete','aguardando_humano',
      'editing_conta_menu','editing_conta_nome','editing_conta_endereco',
      'editing_conta_cep','editing_conta_distribuidora','editing_conta_instalacao','editing_conta_valor',
      'editing_doc_menu','editing_doc_nome','editing_doc_cpf','editing_doc_rg',
      'editing_doc_nascimento','editing_doc_pai','editing_doc_mae'
    )
)
, d1 AS (DELETE FROM conversations WHERE customer_id IN (SELECT id FROM targets) RETURNING 1)
, d2 AS (DELETE FROM ai_slot_dispatch_log WHERE customer_id IN (SELECT id FROM targets) RETURNING 1)
, d3 AS (DELETE FROM bot_step_transitions WHERE customer_id IN (SELECT id FROM targets) RETURNING 1)
UPDATE customers SET
  conversation_step = NULL,
  conversation_summary = NULL,
  summary_updated_at = NULL,
  sales_phase = NULL,
  qualification_score = NULL,
  intent_signals = NULL,
  pain_point = NULL,
  next_followup_at = NULL,
  last_bot_reply_at = NULL,
  bot_paused = false,
  bot_paused_reason = NULL,
  bot_paused_at = NULL,
  error_message = NULL,
  conversational_flow_enabled = NULL
WHERE id IN (SELECT id FROM targets);