
ALTER TABLE public.ad_templates
  ADD COLUMN IF NOT EXISTS target_distribuidora_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_cidades text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.ad_image_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  format text NOT NULL,
  validation jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (image_url, format)
);

ALTER TABLE public.ad_image_validations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read image validations" ON public.ad_image_validations;
CREATE POLICY "Authenticated read image validations"
  ON public.ad_image_validations FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Super admin manages image validations" ON public.ad_image_validations;
CREATE POLICY "Super admin manages image validations"
  ON public.ad_image_validations FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
