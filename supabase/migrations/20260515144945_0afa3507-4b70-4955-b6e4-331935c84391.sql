
-- Allow multiple medias (audio + image + video + ...) attached to the same slot
DROP INDEX IF EXISTS public.ai_media_library_personal_slot_uniq;
DROP INDEX IF EXISTS public.ai_media_library_public_slot_uniq;

-- Recreate non-unique indexes for lookup performance
CREATE INDEX IF NOT EXISTS idx_ai_media_personal_slot
  ON public.ai_media_library (consultant_id, slot_key)
  WHERE slot_key IS NOT NULL AND is_public = false;

CREATE INDEX IF NOT EXISTS idx_ai_media_public_slot
  ON public.ai_media_library (slot_key)
  WHERE slot_key IS NOT NULL AND is_public = true;

-- Per-item delay (ms) the bot should wait BEFORE sending this media.
-- Lets you tune pacing: e.g. 0 for first item, 2000 for next, etc.
ALTER TABLE public.ai_media_library
  ADD COLUMN IF NOT EXISTS delay_before_ms integer NOT NULL DEFAULT 1500;
