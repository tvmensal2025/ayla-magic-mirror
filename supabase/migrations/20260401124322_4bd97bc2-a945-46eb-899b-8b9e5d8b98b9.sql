-- Fix conversations: restrict to consultant's own customers
DROP POLICY IF EXISTS "Authenticated manage conversations" ON public.conversations;

CREATE POLICY "Users manage own customer conversations" ON public.conversations
  FOR ALL TO authenticated
  USING (
    customer_id IN (SELECT id FROM public.customers WHERE consultant_id = auth.uid())
  )
  WITH CHECK (
    customer_id IN (SELECT id FROM public.customers WHERE consultant_id = auth.uid())
  );

-- Fix function search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix consultants_public view to use security_invoker
DROP VIEW IF EXISTS public.consultants_public;
CREATE VIEW public.consultants_public
WITH (security_invoker = on) AS
SELECT 
  id, name, license, phone, cadastro_url, photo_url, 
  igreen_id, created_at, licenciada_cadastro_url,
  facebook_pixel_id, google_analytics_id, referred_by
FROM public.consultants;