
ALTER TABLE public.ai_media_library ADD COLUMN IF NOT EXISTS send_order integer NOT NULL DEFAULT 100;
ALTER TABLE public.consultants ADD COLUMN IF NOT EXISTS flow_step_media_order jsonb NOT NULL DEFAULT '{}'::jsonb;
