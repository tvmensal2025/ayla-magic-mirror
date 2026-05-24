-- Migration: adiciona retry_text e max_retries nos steps capture da variant D
-- Quando OCR falha, o bot usa retry_text em vez de silêncio ou mensagem genérica.
-- Após max_retries tentativas, goto_special:humano pausa o bot e notifica o consultor.

-- d_pedir_conta: fallback com retry_text + escalada para humano após 2 falhas
UPDATE public.bot_flow_steps
SET fallback = jsonb_build_object(
  'mode',        'retry',
  'retry_text',  'Não consegui ler sua conta 😕 Pode tirar outra foto? A fatura inteira, com boa luz, sem cortar as bordas.',
  'max_retries', 2,
  'then',        'humano'
)
WHERE step_key = 'd_pedir_conta'
  AND flow_id IN (
    SELECT id FROM public.bot_flows WHERE variant = 'D' AND is_active = true
  );

-- d_pedir_documento: fallback com retry_text + escalada para humano após 2 falhas
UPDATE public.bot_flow_steps
SET fallback = jsonb_build_object(
  'mode',        'retry',
  'retry_text',  'Hmm, não consegui identificar o documento 🤔 Pode mandar de novo? RG frente+verso ou CNH frente, foto nítida.',
  'max_retries', 2,
  'then',        'humano'
)
WHERE step_key = 'd_pedir_documento'
  AND flow_id IN (
    SELECT id FROM public.bot_flows WHERE variant = 'D' AND is_active = true
  );

-- Garante que d_handoff está inativo (is_active=false) para não ser alcançado
-- por position-advance — só entra via goto_special:humano
UPDATE public.bot_flow_steps
SET is_active = false
WHERE step_key = 'd_handoff'
  AND flow_id IN (
    SELECT id FROM public.bot_flows WHERE variant = 'D'
  );
