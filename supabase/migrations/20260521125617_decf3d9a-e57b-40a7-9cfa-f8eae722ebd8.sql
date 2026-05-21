-- Lote 3 — Infra metrics + super admin alert settings
CREATE TABLE IF NOT EXISTS public.infra_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text NOT NULL,
  value_num numeric,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_infra_metrics_key_created
  ON public.infra_metrics (metric_key, created_at DESC);

ALTER TABLE public.infra_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_read_infra_metrics" ON public.infra_metrics;
CREATE POLICY "super_admin_read_infra_metrics"
  ON public.infra_metrics
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Inserts feitos pelo service role bypassam RLS; sem policy de INSERT pra clients.

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS super_admin_phone text,
  ADD COLUMN IF NOT EXISTS super_admin_instance_name text,
  ADD COLUMN IF NOT EXISTS minio_alert_threshold_pct integer NOT NULL DEFAULT 85;

COMMENT ON COLUMN public.app_settings.super_admin_phone IS
  'Telefone E.164 (só dígitos) do super admin para alertas operacionais.';
COMMENT ON COLUMN public.app_settings.super_admin_instance_name IS
  'Nome da instância whatsapp_instances usada para enviar alertas do super admin.';
COMMENT ON COLUMN public.app_settings.minio_alert_threshold_pct IS
  'Limiar (0-100) de uso de disco MinIO para disparar alerta. Default 85.';