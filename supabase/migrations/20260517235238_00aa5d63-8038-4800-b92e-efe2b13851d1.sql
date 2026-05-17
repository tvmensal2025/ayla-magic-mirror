
-- 1) Colunas para anti-rep de mídia em conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS media_id uuid,
  ADD COLUMN IF NOT EXISTS slot_key text;

CREATE INDEX IF NOT EXISTS idx_conversations_customer_media
  ON public.conversations (customer_id, media_id, created_at DESC)
  WHERE media_id IS NOT NULL;

-- 2) Coluna pending_inbound em customers para enfileiramento de msgs presas no lock
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS pending_inbound_message_id text,
  ADD COLUMN IF NOT EXISTS pending_inbound_at timestamptz;

-- 3) RPC para enfileirar quando lock falhou
CREATE OR REPLACE FUNCTION public.enqueue_pending_inbound(_customer_id uuid, _message_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.customers
     SET pending_inbound_message_id = _message_id,
         pending_inbound_at = now()
   WHERE id = _customer_id;
$$;

-- 4) RPC para limpar fila após reprocessar
CREATE OR REPLACE FUNCTION public.clear_pending_inbound(_customer_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.customers
     SET pending_inbound_message_id = NULL,
         pending_inbound_at = NULL
   WHERE id = _customer_id;
$$;
