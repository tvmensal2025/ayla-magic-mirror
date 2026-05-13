CREATE TABLE IF NOT EXISTS public.ad_generated_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  format text NOT NULL CHECK (format IN ('feed_1x1','story_9x16','reels_9x16','carousel_4x5')),
  image_url text NOT NULL,
  storage_path text,
  prompt_used text,
  brief_used text,
  angle text,
  inspired_by_advertisers text[] DEFAULT '{}',
  used_in_campaign_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_creatives_consultant ON public.ad_generated_creatives(consultant_id, created_at DESC);

ALTER TABLE public.ad_generated_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own generated creatives"
  ON public.ad_generated_creatives FOR ALL
  TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

CREATE POLICY "Admins read all generated creatives"
  ON public.ad_generated_creatives FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));