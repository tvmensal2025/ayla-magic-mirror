
-- ─────────── bot_flow_qa ───────────
CREATE TABLE public.bot_flow_qa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.bot_flows(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  intent_name text NOT NULL DEFAULT 'Sem nome',
  is_opening boolean NOT NULL DEFAULT false,
  is_closing boolean NOT NULL DEFAULT false,
  text_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bot_flow_qa_flow ON public.bot_flow_qa(flow_id, position);

ALTER TABLE public.bot_flow_qa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own qa"
  ON public.bot_flow_qa FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bot_flows f WHERE f.id = bot_flow_qa.flow_id AND f.consultant_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bot_flows f WHERE f.id = bot_flow_qa.flow_id AND f.consultant_id = auth.uid()));

CREATE POLICY "Super admin manages all qa"
  ON public.bot_flow_qa FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER bot_flow_qa_updated BEFORE UPDATE ON public.bot_flow_qa
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────── bot_flow_qa_triggers ───────────
CREATE TABLE public.bot_flow_qa_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_id uuid NOT NULL REFERENCES public.bot_flow_qa(id) ON DELETE CASCADE,
  phrase text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bot_flow_qa_triggers_qa ON public.bot_flow_qa_triggers(qa_id);

ALTER TABLE public.bot_flow_qa_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own triggers"
  ON public.bot_flow_qa_triggers FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bot_flow_qa q
    JOIN public.bot_flows f ON f.id = q.flow_id
    WHERE q.id = bot_flow_qa_triggers.qa_id AND f.consultant_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bot_flow_qa q
    JOIN public.bot_flows f ON f.id = q.flow_id
    WHERE q.id = bot_flow_qa_triggers.qa_id AND f.consultant_id = auth.uid()
  ));

CREATE POLICY "Super admin manages all triggers"
  ON public.bot_flow_qa_triggers FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ─────────── bot_flow_qa_media ───────────
CREATE TABLE public.bot_flow_qa_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_id uuid NOT NULL REFERENCES public.bot_flow_qa(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  media_kind text NOT NULL CHECK (media_kind IN ('audio','video','image')),
  media_id uuid,
  slot_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bot_flow_qa_media_qa ON public.bot_flow_qa_media(qa_id, position);

ALTER TABLE public.bot_flow_qa_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own qa media"
  ON public.bot_flow_qa_media FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bot_flow_qa q
    JOIN public.bot_flows f ON f.id = q.flow_id
    WHERE q.id = bot_flow_qa_media.qa_id AND f.consultant_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bot_flow_qa q
    JOIN public.bot_flows f ON f.id = q.flow_id
    WHERE q.id = bot_flow_qa_media.qa_id AND f.consultant_id = auth.uid()
  ));

CREATE POLICY "Super admin manages all qa media"
  ON public.bot_flow_qa_media FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ─────────── Seed: 1 abertura + 4 Q&As padrão para fluxos existentes ───────────
DO $$
DECLARE
  f record;
  qa_open uuid;
  qa_funciona uuid;
  qa_preco uuid;
  qa_distrib uuid;
  qa_cadastro uuid;
BEGIN
  FOR f IN SELECT id FROM public.bot_flows LOOP
    -- Abertura
    INSERT INTO public.bot_flow_qa (flow_id, position, intent_name, is_opening, text_response)
    VALUES (f.id, 0, 'Boas-vindas', true, 'Olá! Tudo bem? Pra começar, qual seu nome?')
    RETURNING id INTO qa_open;
    INSERT INTO public.bot_flow_qa_media (qa_id, position, media_kind, slot_key)
    VALUES (qa_open, 0, 'audio', 'boas_vindas');

    -- Como funciona
    INSERT INTO public.bot_flow_qa (flow_id, position, intent_name, text_response)
    VALUES (f.id, 1, 'Como funciona', null) RETURNING id INTO qa_funciona;
    INSERT INTO public.bot_flow_qa_triggers (qa_id, phrase) VALUES
      (qa_funciona, 'como funciona'),
      (qa_funciona, 'me explica'),
      (qa_funciona, 'que é isso'),
      (qa_funciona, 'o que é');
    INSERT INTO public.bot_flow_qa_media (qa_id, position, media_kind, slot_key)
    VALUES (qa_funciona, 0, 'audio', 'como_funciona');

    -- Quanto custa
    INSERT INTO public.bot_flow_qa (flow_id, position, intent_name, text_response)
    VALUES (f.id, 2, 'Quanto custa', null) RETURNING id INTO qa_preco;
    INSERT INTO public.bot_flow_qa_triggers (qa_id, phrase) VALUES
      (qa_preco, 'quanto custa'),
      (qa_preco, 'é caro'),
      (qa_preco, 'tem taxa'),
      (qa_preco, 'preço'),
      (qa_preco, 'valor');
    INSERT INTO public.bot_flow_qa_media (qa_id, position, media_kind, slot_key)
    VALUES (qa_preco, 0, 'audio', 'objecao_preco');

    -- Distribuidora
    INSERT INTO public.bot_flow_qa (flow_id, position, intent_name, text_response)
    VALUES (f.id, 3, 'Distribuidora', null) RETURNING id INTO qa_distrib;
    INSERT INTO public.bot_flow_qa_triggers (qa_id, phrase) VALUES
      (qa_distrib, 'minha distribuidora'),
      (qa_distrib, 'qual distribuidora'),
      (qa_distrib, 'atende aqui'),
      (qa_distrib, 'cidade');
    INSERT INTO public.bot_flow_qa_media (qa_id, position, media_kind, slot_key)
    VALUES (qa_distrib, 0, 'audio', 'objecao_distribuidora');

    -- Cadastro / encerramento
    INSERT INTO public.bot_flow_qa (flow_id, position, intent_name, is_closing, text_response)
    VALUES (f.id, 4, 'Quero me cadastrar', true, 'Perfeito! Pra finalizar é só preencher seus dados aqui: {link_cadastro}')
    RETURNING id INTO qa_cadastro;
    INSERT INTO public.bot_flow_qa_triggers (qa_id, phrase) VALUES
      (qa_cadastro, 'quero me cadastrar'),
      (qa_cadastro, 'quero entrar'),
      (qa_cadastro, 'fechado'),
      (qa_cadastro, 'bora'),
      (qa_cadastro, 'quero participar');
    INSERT INTO public.bot_flow_qa_media (qa_id, position, media_kind, slot_key)
    VALUES (qa_cadastro, 0, 'audio', 'chamada_cadastro');
  END LOOP;
END $$;
