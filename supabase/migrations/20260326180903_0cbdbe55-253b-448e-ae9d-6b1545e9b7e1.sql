CREATE TABLE public.page_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL REFERENCES public.consultants(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'click',
  event_target text,
  page_type text NOT NULL DEFAULT 'client',
  device_type text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.page_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public insert" ON public.page_events FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Consultant reads own events" ON public.page_events FOR SELECT TO authenticated USING (consultant_id = auth.uid());

ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS device_type text;
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS utm_source text;
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS utm_medium text;
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS utm_campaign text;