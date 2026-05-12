
CREATE TABLE public.ai_knowledge_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_knowledge_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read knowledge" ON public.ai_knowledge_sections
  FOR SELECT TO public USING (true);

CREATE POLICY "Admins manage knowledge" ON public.ai_knowledge_sections
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
