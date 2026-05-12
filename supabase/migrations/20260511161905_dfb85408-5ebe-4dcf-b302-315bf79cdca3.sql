
CREATE OR REPLACE FUNCTION public.fb_sync_pixel_to_consultant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pixel_id IS NOT NULL AND NEW.pixel_id <> '' THEN
    UPDATE public.consultants
    SET facebook_pixel_id = NEW.pixel_id
    WHERE id = NEW.consultant_id
      AND COALESCE(facebook_pixel_id, '') <> NEW.pixel_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fb_sync_pixel ON public.facebook_connections;
CREATE TRIGGER trg_fb_sync_pixel
AFTER INSERT OR UPDATE OF pixel_id ON public.facebook_connections
FOR EACH ROW EXECUTE FUNCTION public.fb_sync_pixel_to_consultant();

-- Backfill: rodar uma vez para conexões existentes
UPDATE public.consultants c
SET facebook_pixel_id = fc.pixel_id
FROM public.facebook_connections fc
WHERE fc.consultant_id = c.id
  AND fc.pixel_id IS NOT NULL
  AND COALESCE(c.facebook_pixel_id, '') <> fc.pixel_id;
