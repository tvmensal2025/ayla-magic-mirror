
ALTER TABLE public.ad_creative_performance
  ADD COLUMN IF NOT EXISTS creative_format text,
  ADD COLUMN IF NOT EXISTS angle text,
  ADD COLUMN IF NOT EXISTS image_brief text;

ALTER TABLE public.ad_creative_insights
  ADD COLUMN IF NOT EXISTS best_image_briefs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS best_formats jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS competitor_summary text;

CREATE TABLE IF NOT EXISTS public.ad_competitor_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser text NOT NULL,
  page_id text,
  ad_archive_id text UNIQUE,
  headline text,
  primary_text text,
  cta text,
  creative_format text,
  angle text,
  image_url text,
  video_url text,
  thumbnail_url text,
  active_days integer DEFAULT 0,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  region text DEFAULT 'BR',
  raw jsonb,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_advertiser ON public.ad_competitor_creatives(advertiser);
CREATE INDEX IF NOT EXISTS idx_competitor_active_days ON public.ad_competitor_creatives(active_days DESC);

ALTER TABLE public.ad_competitor_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage competitor creatives"
  ON public.ad_competitor_creatives
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read competitor creatives"
  ON public.ad_competitor_creatives
  FOR SELECT
  TO authenticated
  USING (true);
