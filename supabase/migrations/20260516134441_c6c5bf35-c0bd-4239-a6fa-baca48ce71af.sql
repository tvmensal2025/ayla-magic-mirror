-- Desativa todos os áudios .webm existentes na biblioteca
-- (Whapi rejeita .webm em /messages/voice com erro 500).
-- Usuário deve re-gravar via UI (agora produz .ogg/opus direto).
UPDATE public.ai_media_library
   SET active = false,
       updated_at = now()
 WHERE kind = 'audio'
   AND active = true
   AND url ILIKE '%.webm%';