
-- Tabela de fluxos
CREATE TABLE public.bot_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Fluxo sem nome',
  is_active boolean NOT NULL DEFAULT false,
  strict_mode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bot_flows_consultant ON public.bot_flows(consultant_id);
CREATE UNIQUE INDEX uniq_bot_flows_active_per_consultant
  ON public.bot_flows(consultant_id) WHERE is_active = true;

ALTER TABLE public.bot_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own flows" ON public.bot_flows
  FOR ALL TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

CREATE POLICY "Super admin manages all flows" ON public.bot_flows
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE TRIGGER bot_flows_updated_at BEFORE UPDATE ON public.bot_flows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Tabela de passos
CREATE TABLE public.bot_flow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.bot_flows(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  step_type text NOT NULL CHECK (step_type IN ('audio_slot','message','question','media_request','cadastro')),
  slot_key text,
  message_text text,
  wait_for text NOT NULL DEFAULT 'none' CHECK (wait_for IN ('none','reply','media','timer')),
  wait_seconds int NOT NULL DEFAULT 0,
  condition_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bot_flow_steps_flow ON public.bot_flow_steps(flow_id, position);

ALTER TABLE public.bot_flow_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own flow steps" ON public.bot_flow_steps
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bot_flows f WHERE f.id = flow_id AND f.consultant_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bot_flows f WHERE f.id = flow_id AND f.consultant_id = auth.uid()));

CREATE POLICY "Super admin manages all flow steps" ON public.bot_flow_steps
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE TRIGGER bot_flow_steps_updated_at BEFORE UPDATE ON public.bot_flow_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed: cria Fluxo Padrão para cada consultor existente
DO $$
DECLARE
  c record;
  flow_id uuid;
BEGIN
  FOR c IN SELECT id FROM public.consultants LOOP
    INSERT INTO public.bot_flows (consultant_id, name, is_active, strict_mode)
    VALUES (c.id, 'Fluxo Padrão', true, false)
    RETURNING id INTO flow_id;

    INSERT INTO public.bot_flow_steps (flow_id, position, step_type, slot_key, message_text, wait_for) VALUES
      (flow_id, 1,  'audio_slot',    'boas_vindas',         NULL, 'reply'),
      (flow_id, 2,  'question',      NULL, '{nome}, qual o valor médio da sua conta de luz?', 'reply'),
      (flow_id, 3,  'audio_slot',    'como_funciona',       NULL, 'none'),
      (flow_id, 4,  'audio_slot',    'fazenda_solar',       NULL, 'none'),
      (flow_id, 5,  'audio_slot',    'prova_social',        NULL, 'none'),
      (flow_id, 6,  'media_request', NULL, 'Me envia uma foto da sua conta de luz, por favor 📸', 'media'),
      (flow_id, 7,  'audio_slot',    'confirma_recebimento', NULL, 'none'),
      (flow_id, 8,  'media_request', NULL, 'Agora me manda um documento com foto (RG ou CNH) 🪪', 'media'),
      (flow_id, 9,  'audio_slot',    'chamada_cadastro',    NULL, 'none'),
      (flow_id, 10, 'cadastro',      NULL, 'Pra finalizar, é só preencher seus dados aqui: {link_cadastro}', 'none');
  END LOOP;
END $$;
