DROP INDEX IF EXISTS public.ai_media_library_primary_explainer_unique;
DROP INDEX IF EXISTS public.ux_ai_media_library_primary_explainer;
CREATE UNIQUE INDEX ux_ai_media_library_primary_per_kind
  ON public.ai_media_library (consultant_id, kind)
  WHERE is_primary_explainer = true;