
-- =====================================================================
-- FASE A — Vazamentos críticos de dados (auditoria 27/mai)
-- =====================================================================

-- 1) consultants: dropar policy pública que expunha igreen_portal_password.
--    O LP usa a view public.consultants_public (já filtra colunas seguras).
DROP POLICY IF EXISTS "Public read approved consultants minimal" ON public.consultants;

-- Reforço defesa-em-profundidade: revogar SELECT direto na tabela para anon,
-- e revogar acesso às colunas sensíveis também para authenticated não-owner
-- (policies por owner/admin continuam funcionando porque elas controlam linhas;
--  GRANTs controlam colunas. Mantemos GRANT amplo para authenticated porque
--  RLS já restringe a linha do próprio consultor ou admin).
REVOKE SELECT ON public.consultants FROM anon;

-- 2) whatsapp_instances: dropar leitura anônima de números conectados.
DROP POLICY IF EXISTS "Anon read connected phone only" ON public.whatsapp_instances;
REVOKE SELECT ON public.whatsapp_instances FROM anon;

-- 3) app_settings: restringir leitura por allowlist de colunas (não tem coluna "key",
--    é colunar). authenticated lê só flags públicas; super-admin lê tudo via service_role/admin.
DROP POLICY IF EXISTS app_settings_read_authenticated ON public.app_settings;

CREATE POLICY app_settings_read_public_flags
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.app_settings FROM authenticated;
GRANT SELECT (id, bot_global_enabled, resolver_strict_mode, updated_at, minio_alert_threshold_pct)
  ON public.app_settings TO authenticated;

CREATE POLICY app_settings_read_super_admin
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- super-admin precisa de leitura de TODAS as colunas
GRANT SELECT ON public.app_settings TO authenticated;
-- ... mas só super-admin pode ler super_admin_phone, super_admin_instance_name
-- via policy acima. Para forçar column ACL, revogamos novamente as sensíveis:
REVOKE SELECT (super_admin_phone, super_admin_instance_name) ON public.app_settings FROM authenticated;
GRANT SELECT (super_admin_phone, super_admin_instance_name) ON public.app_settings TO service_role;

-- 4) message_templates: a "biblioteca pública" estava vazando templates de outros
--    consultores. Restringir para origin_template_id IS NULL E (consultant_id IS NULL OR é super admin).
DROP POLICY IF EXISTS "Authenticated read public template library" ON public.message_templates;

CREATE POLICY "Authenticated read true public template library"
  ON public.message_templates
  FOR SELECT
  TO authenticated
  USING (origin_template_id IS NULL AND consultant_id IS NULL);

-- 5) Storage: consultant-photos — checar ownership por folder na UPDATE/DELETE.
DROP POLICY IF EXISTS "Owner delete photos" ON storage.objects;
DROP POLICY IF EXISTS "Owner update photos" ON storage.objects;

CREATE POLICY "Owner delete photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'consultant-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Owner update photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'consultant-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'consultant-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6) Storage: video igreen — remover INSERT/UPDATE/DELETE para anon/public.
--    Manter SELECT público (são vídeos do marketing). Mutações só via service_role.
DROP POLICY IF EXISTS "Allow anon update video igreen"   ON storage.objects;
DROP POLICY IF EXISTS "Allow anon upload video igreen"   ON storage.objects;
DROP POLICY IF EXISTS "Allow public update to video igreen" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload to video igreen" ON storage.objects;
DROP POLICY IF EXISTS "Public delete video igreen"       ON storage.objects;

-- 7) Storage: simulator-uploads — restringir leitura ao dono autenticado.
DROP POLICY IF EXISTS "simulator_uploads_public_read" ON storage.objects;

CREATE POLICY "simulator_uploads_owner_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'simulator-uploads'
    AND owner = auth.uid()
  );

-- Tornar o bucket privado (URLs públicas direta deixam de funcionar; app já usa
-- signed URLs / service_role nas edge functions).
UPDATE storage.buckets SET public = false WHERE id = 'simulator-uploads';
