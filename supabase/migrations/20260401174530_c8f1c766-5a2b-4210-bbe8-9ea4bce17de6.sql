DROP POLICY IF EXISTS "Owner select templates" ON public.message_templates;

CREATE POLICY "Authenticated read all templates"
  ON public.message_templates
  FOR SELECT
  TO authenticated
  USING (true);