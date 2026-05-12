
-- 1. Remove dangerous public policies on customers
DROP POLICY IF EXISTS "Public read customers" ON public.customers;

-- 2. Remove dangerous public policy on conversations
DROP POLICY IF EXISTS "Public read conversations" ON public.conversations;

-- 3. Remove dangerous public policy on settings (replace with admin-only read)
DROP POLICY IF EXISTS "Public read settings" ON public.settings;
CREATE POLICY "Authenticated read settings"
  ON public.settings FOR SELECT
  TO authenticated
  USING (true);

-- 4. Remove dangerous public ALL policy on network_members
DROP POLICY IF EXISTS "Service upsert network" ON public.network_members;

-- Add owner-scoped write policies for network_members
CREATE POLICY "Owner insert network"
  ON public.network_members FOR INSERT
  TO authenticated
  WITH CHECK (consultant_id = auth.uid());

CREATE POLICY "Owner update network"
  ON public.network_members FOR UPDATE
  TO authenticated
  USING (consultant_id = auth.uid());

CREATE POLICY "Owner delete network"
  ON public.network_members FOR DELETE
  TO authenticated
  USING (consultant_id = auth.uid());

-- 5. Restrict CRM log insertion to authenticated users only
DROP POLICY IF EXISTS "Service insert logs" ON public.crm_auto_message_log;
CREATE POLICY "Authenticated insert logs"
  ON public.crm_auto_message_log FOR INSERT
  TO authenticated
  WITH CHECK (consultant_id = auth.uid());
