ALTER TABLE public.ai_media_library
  ADD COLUMN IF NOT EXISTS original_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS final_size_bytes BIGINT;