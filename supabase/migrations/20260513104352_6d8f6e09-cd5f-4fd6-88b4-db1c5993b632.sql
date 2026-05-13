ALTER TABLE public.ad_generated_creatives
  ADD COLUMN IF NOT EXISTS composite_url text,
  ADD COLUMN IF NOT EXISTS headline_used text,
  ADD COLUMN IF NOT EXISTS badge_text text,
  ADD COLUMN IF NOT EXISTS overlay_layout jsonb,
  ADD COLUMN IF NOT EXISTS qa_report jsonb,
  ADD COLUMN IF NOT EXISTS qa_attempts int DEFAULT 1;