
CREATE TABLE IF NOT EXISTS public.ai_learning_digest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date date NOT NULL UNIQUE,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_text text,
  sent_at timestamptz,
  sent_to text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_learning_digest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_select_digest" ON public.ai_learning_digest
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ai_learning_digest_date ON public.ai_learning_digest(digest_date DESC);
