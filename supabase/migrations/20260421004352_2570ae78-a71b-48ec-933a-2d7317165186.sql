-- KANBAN_STAGES: permitir leitura global das stages criadas por admins
CREATE POLICY "Authenticated read admin stages"
  ON public.kanban_stages
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(consultant_id::uuid, 'admin'::public.app_role)
  );

-- KANBAN_STAGES: admins podem gerenciar (insert/update/delete) suas próprias stages globais
-- (a policy "Users can manage their own stages" já cobre isso pois consultant_id = auth.uid())

-- STAGE_AUTO_MESSAGES: permitir leitura global das mensagens criadas por admins
CREATE POLICY "Authenticated read admin stage auto messages"
  ON public.stage_auto_messages
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(consultant_id::uuid, 'admin'::public.app_role)
  );