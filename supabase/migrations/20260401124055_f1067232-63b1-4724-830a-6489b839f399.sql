-- Admin pode ler todos os consultores
CREATE POLICY "Admins read all consultants" ON public.consultants
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin pode atualizar consultores (approved, etc)
CREATE POLICY "Admins update consultants" ON public.consultants
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));