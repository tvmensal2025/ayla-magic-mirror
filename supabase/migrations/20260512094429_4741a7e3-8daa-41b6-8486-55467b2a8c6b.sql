
-- 1. Tabela de configurações da plataforma (singleton)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  platform_fee_percent numeric NOT NULL DEFAULT 20.0,
  iof_compensation_percent numeric NOT NULL DEFAULT 6.38,
  min_balance_to_create_campaign_cents bigint NOT NULL DEFAULT 5000,
  default_auto_pause_at_cents bigint NOT NULL DEFAULT 500,
  campaign_safety_multiplier numeric NOT NULL DEFAULT 1.3,
  low_balance_alert_cents bigint NOT NULL DEFAULT 2000,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage platform settings"
  ON public.platform_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Colunas extras pra rastreabilidade
ALTER TABLE public.facebook_metrics_daily
  ADD COLUMN IF NOT EXISTS gross_spend_cents bigint NOT NULL DEFAULT 0;

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS stripe_fee_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_spend_cents bigint;

-- Garantir tipo válido inclui refund
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('topup','spend','refund','adjustment'));

-- Idempotência por session id
CREATE UNIQUE INDEX IF NOT EXISTS wallet_tx_stripe_session_unique
  ON public.wallet_transactions (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- 3. Atualiza debit pra gravar gross + markup
CREATE OR REPLACE FUNCTION public.debit_consultant_wallet(
  _consultant_id uuid,
  _amount_cents bigint,
  _campaign_id uuid DEFAULT NULL,
  _description text DEFAULT NULL,
  _metadata jsonb DEFAULT NULL,
  _gross_spend_cents bigint DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _new_balance bigint;
BEGIN
  IF _amount_cents <= 0 THEN RETURN NULL; END IF;
  INSERT INTO public.consultant_wallet (consultant_id) VALUES (_consultant_id)
    ON CONFLICT (consultant_id) DO NOTHING;
  UPDATE public.consultant_wallet
     SET balance_cents = GREATEST(0, balance_cents - _amount_cents),
         total_spent_cents = total_spent_cents + _amount_cents,
         last_synced_at = now(), updated_at = now()
   WHERE consultant_id = _consultant_id
   RETURNING balance_cents INTO _new_balance;
  INSERT INTO public.wallet_transactions
    (consultant_id, type, amount_cents, balance_after_cents, campaign_id, description, metadata, gross_spend_cents)
  VALUES
    (_consultant_id, 'spend', _amount_cents, _new_balance, _campaign_id, _description, _metadata, _gross_spend_cents);
  RETURN _new_balance;
END;
$$;

-- 4. Credit aceita stripe fee
CREATE OR REPLACE FUNCTION public.credit_consultant_wallet(
  _consultant_id uuid,
  _amount_cents bigint,
  _stripe_session_id text DEFAULT NULL,
  _stripe_payment_intent_id text DEFAULT NULL,
  _description text DEFAULT NULL,
  _metadata jsonb DEFAULT NULL,
  _stripe_fee_cents bigint DEFAULT 0
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _new_balance bigint; _existing_id uuid;
BEGIN
  IF _amount_cents <= 0 THEN RETURN NULL; END IF;
  IF _stripe_session_id IS NOT NULL THEN
    SELECT id INTO _existing_id FROM public.wallet_transactions
     WHERE stripe_session_id = _stripe_session_id LIMIT 1;
    IF _existing_id IS NOT NULL THEN
      SELECT balance_cents INTO _new_balance FROM public.consultant_wallet
       WHERE consultant_id = _consultant_id;
      RETURN _new_balance;
    END IF;
  END IF;
  INSERT INTO public.consultant_wallet (consultant_id) VALUES (_consultant_id)
    ON CONFLICT (consultant_id) DO NOTHING;
  UPDATE public.consultant_wallet
     SET balance_cents = balance_cents + _amount_cents,
         total_topped_up_cents = total_topped_up_cents + _amount_cents,
         updated_at = now()
   WHERE consultant_id = _consultant_id
   RETURNING balance_cents INTO _new_balance;
  INSERT INTO public.wallet_transactions
    (consultant_id, type, amount_cents, balance_after_cents,
     stripe_session_id, stripe_payment_intent_id, description, metadata, stripe_fee_cents)
  VALUES
    (_consultant_id, 'topup', _amount_cents, _new_balance,
     _stripe_session_id, _stripe_payment_intent_id, _description, _metadata, _stripe_fee_cents);
  RETURN _new_balance;
END;
$$;

-- 5. Refund (chargeback / estorno)
CREATE OR REPLACE FUNCTION public.refund_consultant_wallet(
  _consultant_id uuid,
  _amount_cents bigint,
  _stripe_session_id text DEFAULT NULL,
  _stripe_payment_intent_id text DEFAULT NULL,
  _description text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _new_balance bigint; _existing_id uuid;
BEGIN
  IF _amount_cents <= 0 THEN RETURN NULL; END IF;
  -- Idempotência: não estornar duas vezes a mesma session
  IF _stripe_session_id IS NOT NULL THEN
    SELECT id INTO _existing_id FROM public.wallet_transactions
      WHERE type = 'refund' AND stripe_session_id = _stripe_session_id LIMIT 1;
    IF _existing_id IS NOT NULL THEN
      SELECT balance_cents INTO _new_balance FROM public.consultant_wallet
        WHERE consultant_id = _consultant_id;
      RETURN _new_balance;
    END IF;
  END IF;
  UPDATE public.consultant_wallet
     SET balance_cents = GREATEST(0, balance_cents - _amount_cents),
         total_topped_up_cents = GREATEST(0, total_topped_up_cents - _amount_cents),
         updated_at = now()
   WHERE consultant_id = _consultant_id
   RETURNING balance_cents INTO _new_balance;
  INSERT INTO public.wallet_transactions
    (consultant_id, type, amount_cents, balance_after_cents,
     stripe_session_id, stripe_payment_intent_id, description)
  VALUES
    (_consultant_id, 'refund', _amount_cents, _new_balance,
     _stripe_session_id, _stripe_payment_intent_id, _description);
  RETURN _new_balance;
END;
$$;

-- 6. P&L consolidado (somente admin via RLS na chamada)
CREATE OR REPLACE FUNCTION public.get_platform_pnl(_from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS TABLE(
  gross_topped_up_cents bigint,
  stripe_fees_cents bigint,
  net_received_cents bigint,
  refunds_cents bigint,
  gross_meta_spend_cents bigint,
  charged_to_consultants_cents bigint,
  margin_cents bigint,
  net_profit_cents bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH tx AS (
    SELECT * FROM public.wallet_transactions
     WHERE (_from IS NULL OR created_at::date >= _from)
       AND (_to   IS NULL OR created_at::date <= _to)
  )
  SELECT
    COALESCE(SUM(CASE WHEN type='topup'  THEN amount_cents END),0)::bigint,
    COALESCE(SUM(CASE WHEN type='topup'  THEN stripe_fee_cents END),0)::bigint,
    COALESCE(SUM(CASE WHEN type='topup'  THEN amount_cents - stripe_fee_cents END),0)::bigint,
    COALESCE(SUM(CASE WHEN type='refund' THEN amount_cents END),0)::bigint,
    COALESCE(SUM(CASE WHEN type='spend'  THEN COALESCE(gross_spend_cents, amount_cents) END),0)::bigint,
    COALESCE(SUM(CASE WHEN type='spend'  THEN amount_cents END),0)::bigint,
    COALESCE(SUM(CASE WHEN type='spend'  THEN amount_cents - COALESCE(gross_spend_cents, amount_cents) END),0)::bigint,
    (
      COALESCE(SUM(CASE WHEN type='topup'  THEN amount_cents - stripe_fee_cents END),0)
      - COALESCE(SUM(CASE WHEN type='refund' THEN amount_cents END),0)
      - COALESCE(SUM(CASE WHEN type='spend'  THEN COALESCE(gross_spend_cents, amount_cents) END),0)
    )::bigint
  FROM tx;
$$;
