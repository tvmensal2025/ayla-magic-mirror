
CREATE TABLE public.ad_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  headline text NOT NULL DEFAULT '',
  primary_text text NOT NULL DEFAULT '',
  description_text text NOT NULL DEFAULT '',
  age_min integer NOT NULL DEFAULT 28,
  age_max integer NOT NULL DEFAULT 60,
  genders text[] NOT NULL DEFAULT '{}',
  suggested_daily_budget_cents integer NOT NULL DEFAULT 3000,
  status text NOT NULL DEFAULT 'draft',
  usage_count integer NOT NULL DEFAULT 0,
  avg_cpl_cents integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read published templates"
  ON public.ad_templates FOR SELECT TO authenticated
  USING (status = 'published' OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage ad templates"
  ON public.ad_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_ad_templates_updated_at
  BEFORE UPDATE ON public.ad_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ad_template_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.ad_templates(id) ON DELETE CASCADE,
  consultant_id uuid NOT NULL,
  campaign_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ad_template_usages_template ON public.ad_template_usages(template_id);
CREATE INDEX idx_ad_template_usages_consultant ON public.ad_template_usages(consultant_id);

ALTER TABLE public.ad_template_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner inserts usage"
  ON public.ad_template_usages FOR INSERT TO authenticated
  WITH CHECK (consultant_id = auth.uid());

CREATE POLICY "Owner reads own usage"
  ON public.ad_template_usages FOR SELECT TO authenticated
  USING (consultant_id = auth.uid());

CREATE POLICY "Admins read all usages"
  ON public.ad_template_usages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.bump_ad_template_usage_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ad_templates
     SET usage_count = usage_count + 1,
         updated_at = now()
   WHERE id = NEW.template_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_ad_template_usage
  AFTER INSERT ON public.ad_template_usages
  FOR EACH ROW EXECUTE FUNCTION public.bump_ad_template_usage_count();
