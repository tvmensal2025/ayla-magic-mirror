
CREATE TABLE IF NOT EXISTS public.storage_migration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_bucket text NOT NULL,
  source_path text NOT NULL,
  source_url text,
  target_url text,
  target_object_key text,
  consultant_id uuid,
  customer_jid text,
  media_kind text,
  size_bytes bigint,
  status text NOT NULL DEFAULT 'pending',
  error text,
  attempts int NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_bucket, source_path)
);

CREATE INDEX IF NOT EXISTS idx_smlog_status ON public.storage_migration_log(status);
CREATE INDEX IF NOT EXISTS idx_smlog_bucket ON public.storage_migration_log(source_bucket);

ALTER TABLE public.storage_migration_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view migration log"
  ON public.storage_migration_log FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage migration log"
  ON public.storage_migration_log FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_smlog_updated_at
  BEFORE UPDATE ON public.storage_migration_log
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
