DROP VIEW IF EXISTS public.consultants_public;

CREATE VIEW public.consultants_public
WITH (security_invoker = false) AS
SELECT
  c.id,
  c.license,
  c.name,
  c.phone,
  c.cadastro_url,
  c.photo_url,
  c.igreen_id,
  c.licenciada_cadastro_url,
  c.facebook_pixel_id,
  c.google_analytics_id,
  c.created_at,
  c.referred_by
FROM public.consultants AS c
WHERE c.approved IS TRUE;

GRANT SELECT ON TABLE public.consultants_public TO anon, authenticated;