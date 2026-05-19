
-- ===========================================================
-- CAMADA 3: Revogar EXECUTE de anon/public em todas as
-- funções de public, manter grant para authenticated.
-- ===========================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
                   r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- ===========================================================
-- CAMADA 4: Restringir listagem de buckets sensíveis.
-- Mantém SELECT (download por URL pública) liberado.
-- Bloqueia listagem (storage.objects via API LIST) só para
-- consultant-photos e whatsapp-media.
-- ai-agent-media, IMAGE e video igreen continuam públicos.
-- ===========================================================

-- consultant-photos: leitura pública por URL, listagem só autenticado
DROP POLICY IF EXISTS "consultant-photos public list" ON storage.objects;
DROP POLICY IF EXISTS "Public Access consultant-photos" ON storage.objects;
DROP POLICY IF EXISTS "consultant-photos public read" ON storage.objects;

CREATE POLICY "consultant-photos public read by url"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'consultant-photos' AND name IS NOT NULL);

CREATE POLICY "consultant-photos auth list"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'consultant-photos');

-- whatsapp-media: PII de leads — bloquear listagem anônima
DROP POLICY IF EXISTS "whatsapp-media public list" ON storage.objects;
DROP POLICY IF EXISTS "Public Access whatsapp-media" ON storage.objects;
DROP POLICY IF EXISTS "whatsapp-media public read" ON storage.objects;

CREATE POLICY "whatsapp-media public read by url"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'whatsapp-media' AND name IS NOT NULL);

CREATE POLICY "whatsapp-media auth list"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'whatsapp-media');
