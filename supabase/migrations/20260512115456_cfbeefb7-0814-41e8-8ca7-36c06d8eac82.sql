-- Remove sistema de indicação interno (a iGreen já tem programa oficial)
DROP TRIGGER IF EXISTS trg_apply_referral_bonus ON public.customers;
DROP FUNCTION IF EXISTS public.apply_referral_bonus() CASCADE;
DROP TABLE IF EXISTS public.referral_bonuses CASCADE;
ALTER TABLE public.customers DROP COLUMN IF EXISTS referred_by_customer_id;
ALTER TABLE public.platform_settings DROP COLUMN IF EXISTS referral_bonus_cents;