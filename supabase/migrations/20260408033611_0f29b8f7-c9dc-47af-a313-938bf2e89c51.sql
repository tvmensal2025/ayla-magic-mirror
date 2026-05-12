DROP POLICY IF EXISTS "Authenticated read settings" ON public.settings;

CREATE POLICY "Admins read settings"
ON public.settings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));