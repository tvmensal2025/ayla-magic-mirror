ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;
ALTER TABLE public.stage_auto_messages ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;