UPDATE public.ai_media_library
   SET slot_key = NULL
 WHERE active = false
   AND slot_key IS NOT NULL
   AND consultant_id IS NOT NULL
   AND is_public = false;