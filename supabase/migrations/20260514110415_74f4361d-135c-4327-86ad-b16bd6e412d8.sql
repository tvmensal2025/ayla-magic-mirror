ALTER TABLE public.ai_media_library
  ADD COLUMN IF NOT EXISTS is_primary_explainer boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS ai_media_library_one_primary_per_consultant
  ON public.ai_media_library (consultant_id)
  WHERE is_primary_explainer = true;