CREATE TABLE IF NOT EXISTS public.fb_city_cache (
  name text NOT NULL,
  uf text NOT NULL,
  fb_key text NOT NULL,
  region text,
  region_id integer,
  country_code text NOT NULL DEFAULT 'BR',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (name, uf)
);

ALTER TABLE public.fb_city_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read city cache"
ON public.fb_city_cache FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_fb_city_cache_uf ON public.fb_city_cache(uf);