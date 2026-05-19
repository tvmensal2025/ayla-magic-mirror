-- Camada 2.1 — Security Definer Views
-- customer_memory_active: faz só filtro sobre customer_memory (que tem RLS owner-scoped).
-- Switchar para security_invoker preserva o isolamento por consultant_id.
ALTER VIEW public.customer_memory_active SET (security_invoker = true);

-- consultants_public é intencionalmente definidora: é a fonte pública das LPs e expõe
-- apenas campos não sensíveis (id, license, name, phone, fotos, pixel/GA ids).
-- Documentado via COMMENT.
COMMENT ON VIEW public.consultants_public IS
  'Projeção pública de consultants para landing pages. Intencionalmente SECURITY DEFINER — expõe somente campos não sensíveis. Não adicionar email/cpf/credenciais aqui.';

-- Camada 2.2 — RLS Always True em telemetria (anti-envenenamento)
-- Reescreve as policies para aceitar INSERT/UPDATE apenas do service_role.
-- Service role bypassa RLS de qualquer forma, então a policy fica como
-- documentação explícita; e usuários autenticados deixam de poder gravar.

DROP POLICY IF EXISTS "service role inserts ai_decisions" ON public.ai_decisions;
CREATE POLICY "service_role inserts ai_decisions" ON public.ai_decisions
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "service role inserts ai_usage_log" ON public.ai_usage_log;
CREATE POLICY "service_role inserts ai_usage_log" ON public.ai_usage_log
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "service role inserts bot_step_transitions" ON public.bot_step_transitions;
CREATE POLICY "service_role inserts bot_step_transitions" ON public.bot_step_transitions
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role inserts phase logs" ON public.worker_phase_logs;
CREATE POLICY "service_role inserts worker_phase_logs" ON public.worker_phase_logs
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "service role writes ad_playbooks" ON public.ad_playbooks;
CREATE POLICY "service_role inserts ad_playbooks" ON public.ad_playbooks
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "service role updates ad_playbooks" ON public.ad_playbooks;
CREATE POLICY "service_role updates ad_playbooks" ON public.ad_playbooks
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- Policies de analytics públicos (page_views, page_events, crm_page_events) ficam como estão:
-- inserir tracking é intencionalmente público.