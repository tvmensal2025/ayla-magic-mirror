-- 1) Adiciona coluna debt_cents
ALTER TABLE public.consultant_wallet
  ADD COLUMN IF NOT EXISTS debt_cents bigint NOT NULL DEFAULT 0;

-- 2) Recria debit_consultant_wallet (versão com _gross_spend_cents) — agora gera dívida quando saldo insuficiente
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
DECLARE
  _new_balance bigint;
  _current_balance bigint;
  _debt_added bigint := 0;
  _meta jsonb := COALESCE(_metadata, '{}'::jsonb);
BEGIN
  IF _amount_cents <= 0 THEN RETURN NULL; END IF;
  INSERT INTO public.consultant_wallet (consultant_id) VALUES (_consultant_id)
    ON CONFLICT (consultant_id) DO NOTHING;

  SELECT balance_cents INTO _current_balance FROM public.consultant_wallet WHERE consultant_id = _consultant_id FOR UPDATE;

  IF _current_balance < _amount_cents THEN
    _debt_added := _amount_cents - _current_balance;
  END IF;

  UPDATE public.consultant_wallet
     SET balance_cents = GREATEST(0, balance_cents - _amount_cents),
         debt_cents = debt_cents + _debt_added,
         total_spent_cents = total_spent_cents + _amount_cents,
         last_synced_at = now(), updated_at = now()
   WHERE consultant_id = _consultant_id
   RETURNING balance_cents INTO _new_balance;

  IF _debt_added > 0 THEN
    _meta := _meta || jsonb_build_object('debt_added_cents', _debt_added);
  END IF;

  INSERT INTO public.wallet_transactions
    (consultant_id, type, amount_cents, balance_after_cents, campaign_id, description, metadata, gross_spend_cents)
  VALUES
    (_consultant_id, 'spend', _amount_cents, _new_balance, _campaign_id, _description, _meta, _gross_spend_cents);

  RETURN _new_balance;
END;
$$;

-- 3) Recria credit_consultant_wallet (versão com fee) — abate débito antes
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
DECLARE
  _new_balance bigint;
  _existing_id uuid;
  _current_debt bigint;
  _debt_paid bigint := 0;
  _to_balance bigint := _amount_cents;
  _meta jsonb := COALESCE(_metadata, '{}'::jsonb);
BEGIN
  IF _amount_cents <= 0 THEN RETURN NULL; END IF;
  IF _stripe_session_id IS NOT NULL THEN
    SELECT id INTO _existing_id FROM public.wallet_transactions
      WHERE stripe_session_id = _stripe_session_id LIMIT 1;
    IF _existing_id IS NOT NULL THEN
      SELECT balance_cents INTO _new_balance FROM public.consultant_wallet WHERE consultant_id = _consultant_id;
      RETURN _new_balance;
    END IF;
  END IF;

  INSERT INTO public.consultant_wallet (consultant_id) VALUES (_consultant_id)
    ON CONFLICT (consultant_id) DO NOTHING;

  SELECT debt_cents INTO _current_debt FROM public.consultant_wallet WHERE consultant_id = _consultant_id FOR UPDATE;
  IF _current_debt > 0 THEN
    _debt_paid := LEAST(_current_debt, _amount_cents);
    _to_balance := _amount_cents - _debt_paid;
  END IF;

  UPDATE public.consultant_wallet
     SET balance_cents = balance_cents + _to_balance,
         debt_cents = GREATEST(0, debt_cents - _debt_paid),
         total_topped_up_cents = total_topped_up_cents + _amount_cents,
         updated_at = now()
   WHERE consultant_id = _consultant_id
   RETURNING balance_cents INTO _new_balance;

  IF _debt_paid > 0 THEN
    _meta := _meta || jsonb_build_object('debt_settled_cents', _debt_paid);
  END IF;

  INSERT INTO public.wallet_transactions
    (consultant_id, type, amount_cents, balance_after_cents,
     stripe_session_id, stripe_payment_intent_id, description, metadata, stripe_fee_cents)
  VALUES
    (_consultant_id, 'topup', _amount_cents, _new_balance,
     _stripe_session_id, _stripe_payment_intent_id, _description, _meta, _stripe_fee_cents);

  RETURN _new_balance;
END;
$$;