
CREATE TABLE public.crm_auto_message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL,
  consultant_id uuid NOT NULL,
  stage_key text NOT NULL,
  remote_jid text,
  customer_name text,
  message_preview text,
  status text NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_auto_message_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own logs" ON public.crm_auto_message_log
  FOR SELECT TO authenticated USING (consultant_id = auth.uid());

CREATE POLICY "Service insert logs" ON public.crm_auto_message_log
  FOR INSERT WITH CHECK (true);
