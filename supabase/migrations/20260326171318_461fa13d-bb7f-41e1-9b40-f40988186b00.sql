
CREATE TABLE public.page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid REFERENCES public.consultants(id) ON DELETE CASCADE NOT NULL,
  page_type text NOT NULL DEFAULT 'client',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public insert" ON public.page_views FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Consultant reads own views" ON public.page_views FOR SELECT TO authenticated USING (consultant_id = auth.uid());

CREATE INDEX idx_page_views_consultant ON public.page_views(consultant_id);
CREATE INDEX idx_page_views_created ON public.page_views(created_at);
