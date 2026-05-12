-- 1. Singleton: conta Facebook da plataforma (compartilhada por todos)
CREATE TABLE public.platform_facebook_account (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  fb_user_id text,
  fb_user_name text,
  access_token_encrypted text NOT NULL,
  token_expires_at timestamptz,
  business_id text,
  business_name text,
  ad_account_id text NOT NULL,
  ad_account_name text,
  ad_account_currency text,
  page_id text NOT NULL,
  page_name text,
  ig_account_id text,
  ig_account_username text,
  pixel_id text,
  pixel_name text,
  custom_audience_id text,
  lookalike_audience_id text,
  audience_synced_at timestamptz,
  last_validated_at timestamptz,
  validation_errors jsonb,
  status text NOT NULL DEFAULT 'active',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_facebook_account ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage platform fb account"
  ON public.platform_facebook_account FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Configurações de ads por consultor (telefone, cidades, etc)
CREATE TABLE public.consultant_ad_settings (
  consultant_id uuid PRIMARY KEY,
  whatsapp_destination_number text,
  cities jsonb NOT NULL DEFAULT '[]'::jsonb,
  distribuidora_default text,
  display_name text,
  age_min int NOT NULL DEFAULT 28,
  age_max int NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.consultant_ad_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages ad settings"
  ON public.consultant_ad_settings FOR ALL TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());
CREATE POLICY "Admins read all ad settings"
  ON public.consultant_ad_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER consultant_ad_settings_updated_at
  BEFORE UPDATE ON public.consultant_ad_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Wallet (saldo pré-pago)
CREATE TABLE public.consultant_wallet (
  consultant_id uuid PRIMARY KEY,
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  total_topped_up_cents bigint NOT NULL DEFAULT 0,
  total_spent_cents bigint NOT NULL DEFAULT 0,
  auto_pause_at_cents int NOT NULL DEFAULT 500,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.consultant_wallet ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads wallet"
  ON public.consultant_wallet FOR SELECT TO authenticated
  USING (consultant_id = auth.uid());
CREATE POLICY "Admins read all wallets"
  ON public.consultant_wallet FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
-- Sem políticas de INSERT/UPDATE/DELETE → apenas service_role pode modificar
CREATE TRIGGER consultant_wallet_updated_at
  BEFORE UPDATE ON public.consultant_wallet
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Extrato de transações da wallet
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('topup','spend','refund','adjustment')),
  amount_cents bigint NOT NULL,
  balance_after_cents bigint,
  campaign_id uuid,
  stripe_session_id text,
  stripe_payment_intent_id text,
  description text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_tx_consultant_created ON public.wallet_transactions(consultant_id, created_at DESC);
CREATE INDEX idx_wallet_tx_stripe_session ON public.wallet_transactions(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own transactions"
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (consultant_id = auth.uid());
CREATE POLICY "Admins read all transactions"
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
-- Sem políticas de INSERT/UPDATE/DELETE → apenas service_role insere