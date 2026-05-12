-- Allow admins to read all customers
CREATE POLICY "Admins read all customers"
ON public.customers
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to read all CRM deals
CREATE POLICY "Admins read all deals"
ON public.crm_deals
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to read all page views
CREATE POLICY "Admins read all page_views"
ON public.page_views
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to read all conversations (for message counts)
CREATE POLICY "Admins read all conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to read all scheduled messages
CREATE POLICY "Admins read all scheduled_messages"
ON public.scheduled_messages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));