
-- 1) whatsapp_instances: status + last_health_check_at (referenced by evolution-api.ts but missing)
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_status
  ON public.whatsapp_instances(status);

-- 2) customers: cooldown lock so múltiplos crons não duplicam rescue
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS next_rescue_allowed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_customers_next_rescue
  ON public.customers(next_rescue_allowed_at)
  WHERE next_rescue_allowed_at IS NOT NULL;

-- 3) Aposenta o cron ai-closer-cron-every-10min — fica só o bot-stuck-recovery (rebatizado conceitualmente como ai-rescue, sem renomear o job)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-closer-cron-every-10min') THEN
    PERFORM cron.unschedule('ai-closer-cron-every-10min');
  END IF;
END $$;
