
-- Tabela de vínculo manager → consultores
CREATE TABLE IF NOT EXISTS public.ad_account_managers (
  manager_user_id uuid NOT NULL,
  consultant_id   uuid NOT NULL REFERENCES public.consultants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (manager_user_id, consultant_id)
);

ALTER TABLE public.ad_account_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manager reads own links"
  ON public.ad_account_managers FOR SELECT
  USING (manager_user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "super admin manages links insert"
  ON public.ad_account_managers FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "super admin manages links delete"
  ON public.ad_account_managers FOR DELETE
  USING (public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ad_account_managers_manager
  ON public.ad_account_managers (manager_user_id);

-- Função: lista de consultor_ids visíveis para o usuário
CREATE OR REPLACE FUNCTION public.get_managed_consultant_ids(_user uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_super_admin(_user) THEN
      (SELECT array_agg(id) FROM public.consultants)
    ELSE
      ARRAY(
        SELECT _user
        UNION
        SELECT consultant_id FROM public.ad_account_managers
         WHERE manager_user_id = _user
      )
  END;
$$;

-- Helper boolean
CREATE OR REPLACE FUNCTION public.can_view_consultant(_user uuid, _consultant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _user = _consultant
      OR public.is_super_admin(_user)
      OR EXISTS (
        SELECT 1 FROM public.ad_account_managers
         WHERE manager_user_id = _user AND consultant_id = _consultant
      );
$$;

-- Amplia RLS de ad_spend_daily para incluir managers
DROP POLICY IF EXISTS "managers can read ad spend" ON public.ad_spend_daily;
CREATE POLICY "managers can read ad spend"
  ON public.ad_spend_daily FOR SELECT
  USING (public.can_view_consultant(auth.uid(), consultant_id));

-- Amplia RLS de page_views
DROP POLICY IF EXISTS "managers can read page views" ON public.page_views;
CREATE POLICY "managers can read page views"
  ON public.page_views FOR SELECT
  USING (public.can_view_consultant(auth.uid(), consultant_id));

-- Amplia RLS de customers (somente leitura ampliada)
DROP POLICY IF EXISTS "managers can read customers" ON public.customers;
CREATE POLICY "managers can read customers"
  ON public.customers FOR SELECT
  USING (public.can_view_consultant(auth.uid(), consultant_id));
