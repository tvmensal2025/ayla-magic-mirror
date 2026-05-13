ALTER TABLE public.ad_generated_creatives ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

CREATE POLICY "Authenticated read public generated creatives"
ON public.ad_generated_creatives
FOR SELECT
TO authenticated
USING (is_public = true);

CREATE INDEX IF NOT EXISTS idx_ad_generated_creatives_public ON public.ad_generated_creatives(is_public, created_at DESC) WHERE is_public = true;