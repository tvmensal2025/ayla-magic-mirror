
CREATE TABLE IF NOT EXISTS public.capture_field_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  consultant_id uuid NOT NULL,
  field_name text NOT NULL,
  suggested_value text NOT NULL,
  confidence numeric(3,2) NOT NULL DEFAULT 0.0,
  source_message_id uuid,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT capture_field_suggestions_status_chk CHECK (status IN ('pending','accepted','edited','dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_cfs_customer_status ON public.capture_field_suggestions(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_cfs_consultant ON public.capture_field_suggestions(consultant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cfs_pending_field
  ON public.capture_field_suggestions(customer_id, field_name) WHERE status = 'pending';

ALTER TABLE public.capture_field_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manager select cfs"
ON public.capture_field_suggestions FOR SELECT TO authenticated
USING (consultant_id = auth.uid() OR public.can_view_consultant(auth.uid(), consultant_id));

CREATE POLICY "Owner manager insert cfs"
ON public.capture_field_suggestions FOR INSERT TO authenticated
WITH CHECK (consultant_id = auth.uid() OR public.can_view_consultant(auth.uid(), consultant_id));

CREATE POLICY "Owner manager update cfs"
ON public.capture_field_suggestions FOR UPDATE TO authenticated
USING (consultant_id = auth.uid() OR public.can_view_consultant(auth.uid(), consultant_id))
WITH CHECK (consultant_id = auth.uid() OR public.can_view_consultant(auth.uid(), consultant_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.capture_field_suggestions;
