
-- ===== 1) A/B de copy: variações no template =====
ALTER TABLE public.ad_templates
  ADD COLUMN IF NOT EXISTS headline_variants text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_text_variants text[] NOT NULL DEFAULT '{}';

-- ===== 2) Indicação automática =====
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS referred_by_customer_id uuid;

CREATE INDEX IF NOT EXISTS idx_customers_referred_by_customer ON public.customers(referred_by_customer_id);

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS referral_bonus_cents bigint NOT NULL DEFAULT 1000;

CREATE TABLE IF NOT EXISTS public.referral_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_customer_id uuid NOT NULL,
  referred_customer_id uuid NOT NULL UNIQUE,
  consultant_id uuid NOT NULL,
  bonus_cents bigint NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all referral bonuses"
  ON public.referral_bonuses FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owner reads own referral bonuses"
  ON public.referral_bonuses FOR SELECT TO authenticated
  USING (consultant_id = auth.uid());

-- Trigger: quando customer vira 'active' e tem referrer, credita bônus na carteira do consultor
CREATE OR REPLACE FUNCTION public.apply_referral_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bonus bigint;
  _ref_consultant uuid;
BEGIN
  IF NEW.status <> 'active' OR COALESCE(OLD.status, '') = 'active' THEN
    RETURN NEW;
  END IF;
  IF NEW.referred_by_customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Já pagou para este referido?
  IF EXISTS (SELECT 1 FROM public.referral_bonuses WHERE referred_customer_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(referral_bonus_cents, 1000) INTO _bonus FROM public.platform_settings WHERE id = true;
  IF _bonus IS NULL OR _bonus <= 0 THEN RETURN NEW; END IF;

  -- consultor que recebe o bônus = consultor do CLIENTE QUE INDICOU
  SELECT consultant_id INTO _ref_consultant
    FROM public.customers WHERE id = NEW.referred_by_customer_id;
  IF _ref_consultant IS NULL THEN RETURN NEW; END IF;

  -- Credita carteira (idempotente via UNIQUE em referred_customer_id abaixo)
  PERFORM public.credit_consultant_wallet(
    _ref_consultant,
    _bonus,
    NULL, NULL,
    'Bônus de indicação — cliente ' || COALESCE(NEW.name, NEW.id::text),
    jsonb_build_object('referral', true, 'referred_customer_id', NEW.id, 'referrer_customer_id', NEW.referred_by_customer_id),
    0
  );

  INSERT INTO public.referral_bonuses (referrer_customer_id, referred_customer_id, consultant_id, bonus_cents)
  VALUES (NEW.referred_by_customer_id, NEW.id, _ref_consultant, _bonus);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_referral_bonus ON public.customers;
CREATE TRIGGER trg_apply_referral_bonus
  AFTER UPDATE OF status ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.apply_referral_bonus();
