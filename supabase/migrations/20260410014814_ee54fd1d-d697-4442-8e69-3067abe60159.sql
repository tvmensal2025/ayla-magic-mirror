-- Admin can see all WhatsApp instances (needed for connection status in Super Admin)
CREATE POLICY "Admins read all whatsapp_instances"
ON public.whatsapp_instances
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can see all CRM auto message logs
CREATE POLICY "Admins read all crm_auto_message_log"
ON public.crm_auto_message_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));