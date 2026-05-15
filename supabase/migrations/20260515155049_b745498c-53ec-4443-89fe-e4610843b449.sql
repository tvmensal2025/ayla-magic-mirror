-- Suporte a step_types especiais no editor de fluxo (capture_conta, capture_documento, finalizar_cadastro)
-- step_type continua sendo text livre, mas garantimos que os passos novos tenham defaults consistentes.
ALTER TABLE public.bot_flow_steps
  ADD COLUMN IF NOT EXISTS auto_detect_doc_type boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.bot_flow_steps.step_type IS
  'Tipo do passo: message (padrão) | capture_conta | capture_documento | finalizar_cadastro';
COMMENT ON COLUMN public.bot_flow_steps.auto_detect_doc_type IS
  'Quando step_type=capture_documento: se true, IA detecta RG/CNH pela imagem; se false, pergunta ao lead.';