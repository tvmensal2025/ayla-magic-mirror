
-- ====== Hardening pré-publicação ======

-- 1) SETTINGS: parar de expor tokens (whapi_token, worker_secret, etc.) para qualquer consultor logado.
DROP POLICY IF EXISTS "authenticated read settings" ON public.settings;

CREATE POLICY "Authenticated read safe settings"
  ON public.settings FOR SELECT
  TO authenticated
  USING (key IN (
    'superadmin_consultant_id',
    'whapi_connected_phone',
    'last_igreen_sync',
    'nome_representante',
    'strict_script_mode',
    'ai_confidence_threshold_handoff',
    'ai_confidence_threshold_execute',
    'ai_knowledge_extra',
    'ai_knowledge_docs',
    'bot_phone'
  ));

CREATE POLICY "Super admin reads all settings"
  ON public.settings FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- 2) MESSAGE_TEMPLATES: restringir leitura ampla.
--    Consultor enxerga: templates próprios (já coberto) + biblioteca pública (origin_template_id IS NULL).
DROP POLICY IF EXISTS "Authenticated read all templates" ON public.message_templates;

CREATE POLICY "Authenticated read public template library"
  ON public.message_templates FOR SELECT
  TO authenticated
  USING (origin_template_id IS NULL);

-- 3) VIEW consultants_public: trocar para security_invoker e garantir leitura anon de aprovados.
ALTER VIEW public.consultants_public SET (security_invoker = on);

DROP POLICY IF EXISTS "Public read approved consultants minimal" ON public.consultants;
CREATE POLICY "Public read approved consultants minimal"
  ON public.consultants FOR SELECT
  TO anon, authenticated
  USING (approved IS TRUE);
