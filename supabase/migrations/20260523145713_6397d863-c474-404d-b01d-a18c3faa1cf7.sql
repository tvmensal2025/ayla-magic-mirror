
ALTER TABLE public.ai_media_library
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE INDEX IF NOT EXISTS idx_ai_media_library_consultant_hash
  ON public.ai_media_library (consultant_id, content_hash)
  WHERE content_hash IS NOT NULL;

COMMENT ON COLUMN public.ai_media_library.content_hash IS
  'SHA-256 hex do conteúdo binário do arquivo. Usado para deduplicar uploads do mesmo consultor (reutiliza url/storage_path quando hash já existe).';
