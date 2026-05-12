-- Apagar todo histórico de conversas
DELETE FROM public.conversations;

-- Apagar todo histórico de logs do worker
DELETE FROM public.worker_phase_logs;

-- Apagar todas as transições do bot
DELETE FROM public.bot_step_transitions;

-- Apagar deduplicação de webhook (para reprocessar mensagens novas limpas)
DELETE FROM public.webhook_message_dedup;

-- Resetar TODOS os clientes que vieram do fluxo automático do WhatsApp
-- (mantém id, phone_whatsapp, consultant_id, tipo_produto e datas de criação)
UPDATE public.customers
SET
  name = NULL,
  cpf = NULL,
  rg = NULL,
  cep = NULL,
  address_street = NULL,
  address_number = NULL,
  address_complement = NULL,
  address_neighborhood = NULL,
  address_city = NULL,
  address_state = NULL,
  electricity_bill_value = NULL,
  electricity_bill_photo_url = NULL,
  status = 'pending',
  conversation_step = NULL,
  igreen_link = NULL,
  distribuidora = NULL,
  numero_instalacao = NULL,
  ocr_confianca = NULL,
  possui_procurador = false,
  conta_pdf_protegida = false,
  senha_pdf = NULL,
  debitos_aberto = false,
  document_front_url = NULL,
  document_back_url = NULL,
  data_nascimento = NULL,
  phone_landline = NULL,
  email = NULL,
  portal_submitted_at = NULL,
  document_type = NULL,
  otp_code = NULL,
  otp_received_at = NULL,
  error_message = NULL,
  nome_pai = NULL,
  nome_mae = NULL,
  media_consumo = NULL,
  desconto_cliente = NULL,
  andamento_igreen = NULL,
  devolutiva = NULL,
  observacao = NULL,
  igreen_code = NULL,
  data_cadastro = NULL,
  data_ativo = NULL,
  data_validado = NULL,
  status_financeiro = NULL,
  cashback = NULL,
  nivel_licenciado = NULL,
  assinatura_cliente = NULL,
  assinatura_igreen = NULL,
  link_assinatura = NULL,
  document_front_base64 = NULL,
  bill_message_id = NULL,
  bill_base64 = NULL,
  link_facial = NULL,
  facial_confirmed_at = NULL,
  ocr_conta_attempts = 0,
  ocr_doc_attempts = 0,
  last_bot_reply_at = NULL,
  rescue_attempts = 0,
  last_rescue_at = NULL,
  phone_contact_confirmed = false,
  media_message_id = NULL,
  updated_at = now()
WHERE phone_whatsapp NOT LIKE 'sem_%'
  AND phone_whatsapp NOT LIKE 'sem_celular%';