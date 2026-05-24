-- 1) Flag de sandbox
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_customers_is_sandbox
  ON public.customers (consultant_id)
  WHERE is_sandbox = true;

-- 2) Função-guarda: se o customer for sandbox, ignora INSERT.
CREATE OR REPLACE FUNCTION public.skip_insert_if_sandbox_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_sandbox boolean;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT is_sandbox INTO v_is_sandbox
    FROM public.customers
    WHERE id = NEW.customer_id;
  IF v_is_sandbox IS TRUE THEN
    RAISE NOTICE 'sandbox_skip on %', TG_TABLE_NAME;
    RETURN NULL;  -- silencia o INSERT
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Aplica em tabelas críticas
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_deals',
    'bot_handoff_alerts',
    'pending_outbound_media',
    'facebook_capi_events',
    'conversations',
    'outbound_message_log',
    'ai_usage_log'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_skip_sandbox_%I ON public.%I;', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_skip_sandbox_%I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.skip_insert_if_sandbox_customer();',
      t, t
    );
  END LOOP;
END $$;

-- 4) Bucket público para uploads do simulador (fotos de conta de luz / documento)
INSERT INTO storage.buckets (id, name, public)
VALUES ('simulator-uploads', 'simulator-uploads', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policies (público leitura, autenticado escreve)
DROP POLICY IF EXISTS "simulator_uploads_public_read" ON storage.objects;
CREATE POLICY "simulator_uploads_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'simulator-uploads');

DROP POLICY IF EXISTS "simulator_uploads_authenticated_write" ON storage.objects;
CREATE POLICY "simulator_uploads_authenticated_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'simulator-uploads');

DROP POLICY IF EXISTS "simulator_uploads_owner_delete" ON storage.objects;
CREATE POLICY "simulator_uploads_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'simulator-uploads' AND owner = auth.uid());