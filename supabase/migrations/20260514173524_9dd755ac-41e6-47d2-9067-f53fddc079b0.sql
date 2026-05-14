INSERT INTO public.ai_agent_slots (
  slot_key,
  label,
  description,
  trigger_hint,
  fallback_text,
  min_interval_minutes,
  position,
  active,
  version
)
VALUES (
  'como_funciona',
  'Como funciona a energia',
  'Explica o modelo da iGreen quando o lead pergunta "como funciona?".',
  'Use quando o lead perguntar como funciona, o que é, ou pedir explicação geral do serviço.',
  'A gente conecta sua conta de luz à energia limpa de uma fazenda solar e você economiza todo mês, sem obra e sem mudar nada na sua casa.',
  120,
  3,
  true,
  1
)
ON CONFLICT (slot_key) DO NOTHING;