ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS ocr_conta_attempts INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS ocr_doc_attempts INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_bot_reply_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_last_bot_reply
ON public.customers (last_bot_reply_at)
WHERE conversation_step IS NOT NULL
  AND conversation_step NOT IN ('complete', 'portal_submitting', 'aguardando_otp', 'validando_otp', 'aguardando_facial', 'aguardando_assinatura', 'aguardando_humano');