-- Fix conversations: replace public access with proper auth-based access
DROP POLICY IF EXISTS "Allow all for anon" ON public.conversations;

-- Conversations are linked to customers, allow authenticated users
CREATE POLICY "Authenticated manage conversations" ON public.conversations
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Fix settings: keep public read but restrict writes to admins
DROP POLICY IF EXISTS "Allow all for anon" ON public.settings;

CREATE POLICY "Public read settings" ON public.settings
  FOR SELECT TO public
  USING (true);

CREATE POLICY "Admins manage settings" ON public.settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fix whatsapp_instances: add WITH CHECK
DROP POLICY IF EXISTS "Users can manage own instances" ON public.whatsapp_instances;

CREATE POLICY "Users manage own instances" ON public.whatsapp_instances
  FOR ALL TO authenticated
  USING (auth.uid() = consultant_id)
  WITH CHECK (auth.uid() = consultant_id);