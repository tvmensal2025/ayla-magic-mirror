INSERT INTO public.ai_media_library
  (consultant_id, kind, label, url, step_tags, intent_tags, priority, is_public, active, duration_sec)
VALUES
  (NULL, 'video', 'Conexão Green — apresentação 1min',
   'https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/video%20igreen/Green_Energy.mp4',
   ARRAY['descoberta','pitch','any']::text[],
   ARRAY['any']::text[],
   85, true, true, 60);