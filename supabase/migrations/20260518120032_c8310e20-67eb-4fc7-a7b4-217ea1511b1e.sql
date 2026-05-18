CREATE TABLE IF NOT EXISTS public.ad_image_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  consultant_id UUID NOT NULL,
  url TEXT NOT NULL,
  storage_path TEXT,
  format TEXT NOT NULL CHECK (format IN ('square','vertical','story')),
  width INTEGER,
  height INTEGER,
  file_size BIGINT,
  content_type TEXT,
  filename TEXT,
  fb_image_hash TEXT,
  fb_image_hash_synced_at TIMESTAMPTZ,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_image_library_consultant_format
  ON public.ad_image_library (consultant_id, format, last_used_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ad_image_library_url
  ON public.ad_image_library (url);

ALTER TABLE public.ad_image_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own ad images"
  ON public.ad_image_library FOR ALL TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

CREATE POLICY "Admins read all ad images"
  ON public.ad_image_library FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

CREATE TRIGGER trg_ad_image_library_updated_at
  BEFORE UPDATE ON public.ad_image_library
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();