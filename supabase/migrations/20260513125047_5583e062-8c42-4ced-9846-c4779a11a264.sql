
-- 1) ai_agent_slots
CREATE TABLE IF NOT EXISTS public.ai_agent_slots (
  slot_key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  trigger_hint text,
  fallback_text text,
  min_interval_minutes integer NOT NULL DEFAULT 60,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_agent_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read slots"
  ON public.ai_agent_slots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin manages slots"
  ON public.ai_agent_slots FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE TRIGGER trg_slots_updated_at
  BEFORE UPDATE ON public.ai_agent_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) ai_media_library: novas colunas
ALTER TABLE public.ai_media_library
  ADD COLUMN IF NOT EXISTS slot_key text REFERENCES public.ai_agent_slots(slot_key) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ai_media_library_slot_key_idx ON public.ai_media_library(slot_key);

-- Unicidade: 1 personal por consultor+slot, 1 público por slot
CREATE UNIQUE INDEX IF NOT EXISTS ai_media_library_personal_slot_uniq
  ON public.ai_media_library(consultant_id, slot_key)
  WHERE slot_key IS NOT NULL AND is_public = false;

CREATE UNIQUE INDEX IF NOT EXISTS ai_media_library_public_slot_uniq
  ON public.ai_media_library(slot_key)
  WHERE slot_key IS NOT NULL AND is_public = true;

-- 3) ai_slot_dispatch_log
CREATE TABLE IF NOT EXISTS public.ai_slot_dispatch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  customer_id uuid,
  slot_key text NOT NULL,
  media_id uuid,
  variant text NOT NULL CHECK (variant IN ('default','personal','fallback_text')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  reply_within_min integer
);

CREATE INDEX IF NOT EXISTS ai_slot_dispatch_lookup_idx
  ON public.ai_slot_dispatch_log(customer_id, slot_key, sent_at DESC);

ALTER TABLE public.ai_slot_dispatch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own dispatch logs"
  ON public.ai_slot_dispatch_log FOR SELECT TO authenticated
  USING (consultant_id = auth.uid());

CREATE POLICY "Admins read all dispatch logs"
  ON public.ai_slot_dispatch_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4) Seed inicial dos 8 slots
INSERT INTO public.ai_agent_slots (slot_key, label, description, trigger_hint, fallback_text, min_interval_minutes, position) VALUES
('boas_vindas', 'Boas-vindas', 'Primeira resposta após o lead falar.', 'Use APENAS na primeira interação com o lead, antes de qualquer pergunta.', 'Oi! Tudo bem? Que bom te ver por aqui 😊', 240, 1),
('confirma_recebimento', 'Confirmação de recebimento', 'Confirma que recebeu a conta/documento do lead.', 'Use logo após o lead enviar foto da conta de luz ou documento, para humanizar a espera.', 'Perfeito, recebi aqui! Já tô analisando, um instante 👌', 30, 2),
('como_funciona', 'Como funciona a energia', 'Explica o modelo da iGreen quando o lead pergunta "como funciona?".', 'Use quando o lead perguntar como funciona, o que é, ou pedir explicação geral do serviço.', 'A gente conecta sua conta de luz à energia limpa de uma fazenda solar e você economiza todo mês, sem obra e sem mudar nada na sua casa.', 120, 3),
('fazenda_solar', 'Fazenda solar', 'Explica de onde vem a energia.', 'Use quando o lead perguntar de onde vem a energia, se é confiável, ou demonstrar curiosidade sobre a fonte.', 'A energia vem de fazendas solares parceiras aqui do Brasil — limpa, renovável, e injetada na rede da sua distribuidora.', 120, 4),
('objecao_preco', 'Objeção de preço', 'Quebra objeção "tá caro" / "depois eu vejo".', 'Use quando o lead reclamar do preço, disser que é caro, ou enrolar tipo "depois eu vejo".', 'Olha, não tem custo nenhum pra entrar — você só passa a pagar a energia mais barata que já consumia. A economia começa no próximo mês.', 180, 5),
('objecao_distribuidora', 'Objeção da distribuidora', 'Responde sobre cobertura.', 'Use quando o lead perguntar se a distribuidora dele atende ou disser o nome de uma distribuidora.', 'A gente atende a maioria das distribuidoras do Brasil. Me manda o CEP ou a cidade que eu confirmo na hora!', 180, 6),
('prova_social', 'Prova social', 'Mostra que outras pessoas já usam.', 'Use quando o lead pedir validação, perguntar se é confiável, ou demonstrar insegurança.', 'Já tem mais de 50 mil clientes economizando todo mês com a gente. Posso te mostrar alguns depoimentos se quiser!', 240, 7),
('chamada_cadastro', 'Chamada para cadastro', 'Convida para finalizar o cadastro.', 'Use quando o lead já demonstrou interesse claro e está pronto para fechar.', 'Demais! Pra começar, eu vou precisar só da foto da sua conta de luz e um documento com foto. Quer mandar agora?', 60, 8)
ON CONFLICT (slot_key) DO NOTHING;
