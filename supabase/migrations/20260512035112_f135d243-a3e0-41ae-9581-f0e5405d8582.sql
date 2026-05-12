
ALTER TABLE public.facebook_metrics_daily
  ADD COLUMN IF NOT EXISTS synced_to_wallet_cents bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.debit_consultant_wallet(
  _consultant_id uuid,
  _amount_cents bigint,
  _campaign_id uuid DEFAULT NULL,
  _description text DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance bigint;
BEGIN
  IF _amount_cents <= 0 THEN RETURN NULL; END IF;
  -- Garante existência
  INSERT INTO public.consultant_wallet (consultant_id) VALUES (_consultant_id)
  ON CONFLICT (consultant_id) DO NOTHING;

  UPDATE public.consultant_wallet
     SET balance_cents = GREATEST(0, balance_cents - _amount_cents),
         total_spent_cents = total_spent_cents + _amount_cents,
         last_synced_at = now(),
         updated_at = now()
   WHERE consultant_id = _consultant_id
   RETURNING balance_cents INTO _new_balance;

  INSERT INTO public.wallet_transactions
    (consultant_id, type, amount_cents, balance_after_cents, campaign_id, description, metadata)
  VALUES
    (_consultant_id, 'spend', _amount_cents, _new_balance, _campaign_id, _description, _metadata);

  RETURN _new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_consultant_wallet(
  _consultant_id uuid,
  _amount_cents bigint,
  _stripe_session_id text DEFAULT NULL,
  _stripe_payment_intent_id text DEFAULT NULL,
  _description text DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance bigint;
  _existing_id uuid;
BEGIN
  IF _amount_cents <= 0 THEN RETURN NULL; END IF;

  -- Idempotência por stripe_session_id
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
     stripe_session_id, stripe_payment_intent_id, description, metadata)
  VALUES
    (_consultant_id, 'topup', _amount_cents, _new_balance,
     _stripe_session_id, _stripe_payment_intent_id, _description, _metadata);

  RETURN _new_balance;
END;
$$;

-- Garantir constraint única em consultant_wallet pra ON CONFLICT funcionar
ALTER TABLE public.consultant_wallet
  DROP CONSTRAINT IF EXISTS consultant_wallet_consultant_id_key;
ALTER TABLE public.consultant_wallet
  ADD CONSTRAINT consultant_wallet_consultant_id_key UNIQUE (consultant_id);
