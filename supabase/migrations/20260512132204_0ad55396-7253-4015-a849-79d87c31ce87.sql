-- 1. Marca rafael.ids@icloud.com como super_admin
INSERT INTO public.user_roles (user_id, role)
VALUES ('0c2711ad-4836-41e6-afba-edd94f698ae3', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Função is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

-- 3. Colunas para fork em ad_templates
ALTER TABLE public.ad_templates
  ADD COLUMN IF NOT EXISTS consultant_id uuid,
  ADD COLUMN IF NOT EXISTS origin_template_id uuid REFERENCES public.ad_templates(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ad_templates_consultant ON public.ad_templates(consultant_id);
CREATE INDEX IF NOT EXISTS idx_ad_templates_origin ON public.ad_templates(origin_template_id);

-- 4. Coluna origin em message_templates
ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS origin_template_id uuid REFERENCES public.message_templates(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_message_templates_origin ON public.message_templates(origin_template_id);

-- 5. Função fork_message_template
CREATE OR REPLACE FUNCTION public.fork_message_template(_origin_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_id uuid;
  _user uuid := auth.uid();
  _existing uuid;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  -- Se já existe fork desse usuário pra esse origin, retorna ele
  SELECT id INTO _existing
    FROM public.message_templates
   WHERE consultant_id = _user AND origin_template_id = _origin_id
   LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  INSERT INTO public.message_templates
    (consultant_id, origin_template_id, name, content, media_type, media_url, image_url)
  SELECT _user, id, name, content, media_type, media_url, image_url
    FROM public.message_templates WHERE id = _origin_id
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

-- 6. Função fork_ad_template
CREATE OR REPLACE FUNCTION public.fork_ad_template(_origin_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_id uuid;
  _user uuid := auth.uid();
  _existing uuid;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT id INTO _existing
    FROM public.ad_templates
   WHERE consultant_id = _user AND origin_template_id = _origin_id
   LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  INSERT INTO public.ad_templates
    (consultant_id, origin_template_id, title, description, headline, primary_text,
     description_text, photos, age_min, age_max, genders, suggested_daily_budget_cents,
     status, headline_variants, primary_text_variants)
  SELECT _user, id, title, description, headline, primary_text,
         description_text, photos, age_min, age_max, genders, suggested_daily_budget_cents,
         'published', headline_variants, primary_text_variants
    FROM public.ad_templates WHERE id = _origin_id
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

-- 7. RLS message_templates: revoga as políticas amplas e define por dono/super_admin
DROP POLICY IF EXISTS "Admins delete all templates" ON public.message_templates;
DROP POLICY IF EXISTS "Admins insert templates" ON public.message_templates;
DROP POLICY IF EXISTS "Admins update all templates" ON public.message_templates;
DROP POLICY IF EXISTS "Owner delete templates" ON public.message_templates;
DROP POLICY IF EXISTS "Owner insert templates" ON public.message_templates;
DROP POLICY IF EXISTS "Owner update templates" ON public.message_templates;

CREATE POLICY "Super admin manages original message templates"
ON public.message_templates FOR ALL TO authenticated
USING (origin_template_id IS NULL AND public.is_super_admin(auth.uid()))
WITH CHECK (origin_template_id IS NULL AND public.is_super_admin(auth.uid()));

CREATE POLICY "Owner manages own message template forks"
ON public.message_templates FOR ALL TO authenticated
USING (consultant_id = auth.uid() AND origin_template_id IS NOT NULL)
WITH CHECK (consultant_id = auth.uid() AND origin_template_id IS NOT NULL);

-- Permite owner gerenciar templates próprios sem fork (criados do zero)
CREATE POLICY "Owner manages own original message templates"
ON public.message_templates FOR ALL TO authenticated
USING (consultant_id = auth.uid())
WITH CHECK (consultant_id = auth.uid());

-- 8. RLS ad_templates: substitui "Admins manage" por super_admin / owner-fork
DROP POLICY IF EXISTS "Admins manage ad templates" ON public.ad_templates;

CREATE POLICY "Super admin manages original ad templates"
ON public.ad_templates FOR ALL TO authenticated
USING (consultant_id IS NULL AND public.is_super_admin(auth.uid()))
WITH CHECK (consultant_id IS NULL AND public.is_super_admin(auth.uid()));

CREATE POLICY "Owner manages own ad template forks"
ON public.ad_templates FOR ALL TO authenticated
USING (consultant_id = auth.uid())
WITH CHECK (consultant_id = auth.uid());

-- Atualiza policy de leitura: cada usuário vê originais publicados + seus forks
DROP POLICY IF EXISTS "Authenticated read published templates" ON public.ad_templates;
CREATE POLICY "Read published ad templates and own forks"
ON public.ad_templates FOR SELECT TO authenticated
USING (
  (status = 'published' AND consultant_id IS NULL)
  OR consultant_id = auth.uid()
  OR public.is_super_admin(auth.uid())
);

-- 9. Storage bucket IMAGE — políticas
DROP POLICY IF EXISTS "Public read IMAGE" ON storage.objects;
DROP POLICY IF EXISTS "Super admin manages IMAGE originals" ON storage.objects;
DROP POLICY IF EXISTS "Owner manages own IMAGE folder" ON storage.objects;

CREATE POLICY "Public read IMAGE"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'IMAGE');

CREATE POLICY "Super admin manages IMAGE originals"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'IMAGE' AND public.is_super_admin(auth.uid()))
WITH CHECK (bucket_id = 'IMAGE' AND public.is_super_admin(auth.uid()));

CREATE POLICY "Owner manages own IMAGE folder"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'IMAGE'
  AND (storage.foldername(name))[1] = ('consultant-' || auth.uid()::text)
)
WITH CHECK (
  bucket_id = 'IMAGE'
  AND (storage.foldername(name))[1] = ('consultant-' || auth.uid()::text)
);

-- 10. Cache do adlabel do Facebook por consultor
ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS facebook_label_id text;