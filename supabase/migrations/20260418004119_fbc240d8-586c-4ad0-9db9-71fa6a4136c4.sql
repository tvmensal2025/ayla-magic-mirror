CREATE TABLE public.worker_phase_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid,
  phase text NOT NULL,
  status text NOT NULL DEFAULT 'started',
  message text,
  selector_used text,
  screenshot_url text,
  duration_ms integer,
  attempt integer DEFAULT 1,
  worker_version text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_worker_phase_logs_customer ON public.worker_phase_logs(customer_id, created_at DESC);
CREATE INDEX idx_worker_phase_logs_created ON public.worker_phase_logs(created_at DESC);
CREATE INDEX idx_worker_phase_logs_status ON public.worker_phase_logs(status) WHERE status IN ('failed', 'aborted');

ALTER TABLE public.worker_phase_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all phase logs"
ON public.worker_phase_logs FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role inserts phase logs"
ON public.worker_phase_logs FOR INSERT
TO authenticated, anon, service_role
WITH CHECK (true);

CREATE POLICY "Admins delete phase logs"
ON public.worker_phase_logs FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));