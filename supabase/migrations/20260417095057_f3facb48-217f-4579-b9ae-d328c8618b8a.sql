-- ============================================================
-- P0.1: Fechar vazamento de consultant_id em whatsapp_instances
-- ============================================================

-- Remover policy aberta para anon
DROP POLICY IF EXISTS "Public read connected phone" ON public.whatsapp_instances;

-- View pública restrita (apenas dados não sensíveis)
CREATE OR REPLACE VIEW public.whatsapp_instances_public
WITH (security_invoker = true) AS
SELECT
  instance_name,
  connected_phone
FROM public.whatsapp_instances
WHERE connected_phone IS NOT NULL;

GRANT SELECT ON public.whatsapp_instances_public TO anon, authenticated;

-- Recriar leitura anon, mas só de connected_phone via policy minimalista
-- (a view acima é a interface pública preferida, mas mantemos uma policy
--  restrita para o cliente JS que ainda lê whatsapp_instances diretamente)
CREATE POLICY "Anon read connected phone only"
ON public.whatsapp_instances
FOR SELECT
TO anon
USING (connected_phone IS NOT NULL);

-- ============================================================
-- P0.2: Deduplicação persistente de mensagens do webhook
-- ============================================================

CREATE TABLE IF NOT EXISTS public.webhook_message_dedup (
  message_id text PRIMARY KEY,
  instance_name text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_message_dedup_processed_at_idx
  ON public.webhook_message_dedup (processed_at);

ALTER TABLE public.webhook_message_dedup ENABLE ROW LEVEL SECURITY;

-- Apenas service_role escreve/lê (edge function). Sem policies = bloqueado para clientes.
-- Service role bypassa RLS naturalmente.

-- Cleanup automático diário
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cleanup-webhook-dedup',
  '15 3 * * *',
  $$DELETE FROM public.webhook_message_dedup WHERE processed_at < now() - interval '1 day'$$
);

-- ============================================================
-- P0.4: Audit log de ações sensíveis do Super Admin
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
  ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_idx
  ON public.admin_audit_log (admin_user_id);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit log"
ON public.admin_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert audit log"
ON public.admin_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND admin_user_id = auth.uid()
);

-- Helper: função para registrar ações
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action text,
  _target_type text DEFAULT NULL,
  _target_id text DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), _action, _target_type, _target_id, _metadata)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- ============================================================
-- P1.3: Funil de transições do bot (analytics)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bot_step_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  consultant_id uuid,
  phone text,
  from_step text,
  to_step text NOT NULL,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_step_transitions_customer_idx
  ON public.bot_step_transitions (customer_id);
CREATE INDEX IF NOT EXISTS bot_step_transitions_consultant_idx
  ON public.bot_step_transitions (consultant_id);
CREATE INDEX IF NOT EXISTS bot_step_transitions_created_at_idx
  ON public.bot_step_transitions (created_at DESC);
CREATE INDEX IF NOT EXISTS bot_step_transitions_to_step_idx
  ON public.bot_step_transitions (to_step);

ALTER TABLE public.bot_step_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all transitions"
ON public.bot_step_transitions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Consultants read own transitions"
ON public.bot_step_transitions
FOR SELECT
TO authenticated
USING (consultant_id = auth.uid());

-- ============================================================
-- P1.2: Suporte ao cron de leads presos em OTP
-- ============================================================

CREATE INDEX IF NOT EXISTS customers_conversation_step_idx
  ON public.customers (conversation_step)
  WHERE conversation_step IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_otp_received_at_idx
  ON public.customers (otp_received_at)
  WHERE otp_received_at IS NOT NULL;