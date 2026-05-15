
CREATE TABLE public.bot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_key text NOT NULL,
  template_key text NOT NULL,
  variant text NOT NULL DEFAULT 'default',
  text text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (step_key, template_key, variant)
);

CREATE INDEX idx_bot_messages_lookup ON public.bot_messages (step_key, template_key, variant) WHERE active = true;

ALTER TABLE public.bot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read active bot messages"
  ON public.bot_messages FOR SELECT
  TO authenticated
  USING (active = true);

CREATE POLICY "Super admin manages bot messages"
  ON public.bot_messages FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_bot_messages_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bot_messages_updated_at
  BEFORE UPDATE ON public.bot_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_bot_messages_updated_at();

ALTER TABLE public.bot_step_transitions
  ADD COLUMN IF NOT EXISTS intent text,
  ADD COLUMN IF NOT EXISTS confidence numeric;

INSERT INTO public.bot_messages (step_key, template_key, text) VALUES
  ('welcome', 'saudacao', 'Oi! Aqui é a Camila, assistente do {{representante}} 👋\n\nVi que você se interessou pelo desconto na conta de luz. Posso te explicar rapidinho como funciona?'),
  ('menu_inicial', 'reforco', '{{nome}}, ainda quer entender como funciona o desconto? Posso te mandar um vídeo curtinho explicando 🎥'),
  ('qualificacao', 'pergunta_conta', 'Pra eu te ajudar melhor, qual o valor médio da sua conta de luz hoje? 💡'),
  ('pos_video', 'checkin', 'E aí, {{nome}}, conseguiu ver o vídeo? Ficou alguma dúvida ou já posso te ajudar a garantir o desconto? 😊'),
  ('checkin_pos_video', 'reforco_checkin', '{{nome}}, ficou alguma dúvida do que te mostrei? Posso responder ou já partimos pro cadastro 👇'),
  ('checkin_pos_video', 'pedir_conta', 'Perfeito! Pra eu já garantir seu desconto, me manda uma foto ou PDF da sua última conta de luz 📸'),
  ('pitch_conexao_club', 'apresentar', 'Olha que legal, {{nome}} — além do desconto, você ainda ganha cashback comprando em mais de 20 mil lojas pelo Conexão Club. Vou te mostrar 👇'),
  ('duvidas_pos_club', 'pode_perguntar', 'Pode perguntar à vontade, {{nome}} — tô aqui pra esclarecer tudo antes de você decidir 🤝'),
  ('duvidas_pos_club', 'rumo_cadastro', 'Show! Bora garantir seu desconto então. Me envia uma foto da sua conta de luz 📸'),
  ('aguardando_humano', 'avisado', 'Já avisei o {{representante}}, {{nome}}. Em breve ele te chama por aqui 👍'),
  ('fallback', 'nao_entendi', 'Desculpa, {{nome}}, não captei. Pode reformular? Ou se preferir, digite *cadastro* pra começar 🙂');
