
-- Tabela de configurações globais do app (singleton: linha única com id='global')
CREATE TABLE IF NOT EXISTS public.app_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  bot_global_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

INSERT INTO public.app_settings (id, bot_global_enabled)
VALUES ('global', TRUE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Qualquer authenticated pode ler (edge functions usam service role e bypassam)
DROP POLICY IF EXISTS "app_settings_read_authenticated" ON public.app_settings;
CREATE POLICY "app_settings_read_authenticated"
ON public.app_settings FOR SELECT
TO authenticated
USING (true);

-- Apenas super_admin pode atualizar
DROP POLICY IF EXISTS "app_settings_update_super_admin" ON public.app_settings;
CREATE POLICY "app_settings_update_super_admin"
ON public.app_settings FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Coluna do_not_contact em customers (Fase 3 — opt-out SAIR)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_customers_do_not_contact
  ON public.customers (do_not_contact) WHERE do_not_contact = TRUE;
