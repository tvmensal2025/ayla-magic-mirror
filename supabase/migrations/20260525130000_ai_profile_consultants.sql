-- ============================================================================
-- AI Profile + Provider preference per consultant
-- ============================================================================
-- Adiciona configurações de IA por consultor:
--   ai_profile: 'accuracy' (Gemini 3.1 Pro / GPT-5.5) | 'balanced' (default,
--               Gemini 3.5 Flash) | 'fast' (Gemini 2.5 Flash-Lite, mais barato)
--   ai_provider_pref: 'google' (default) | 'openai'
--
-- Lidos por `_shared/ai-config.ts` em todas as Edge Functions de IA.
-- Cache em memória de 60s (sem trigger de invalidação — admin troca uma vez,
-- ele se propaga em <1min).
-- ============================================================================

ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS ai_profile text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS ai_provider_pref text NOT NULL DEFAULT 'google';

-- Constraints idempotentes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultants_ai_profile_check'
  ) THEN
    ALTER TABLE public.consultants
      ADD CONSTRAINT consultants_ai_profile_check
      CHECK (ai_profile IN ('accuracy', 'balanced', 'fast'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultants_ai_provider_pref_check'
  ) THEN
    ALTER TABLE public.consultants
      ADD CONSTRAINT consultants_ai_provider_pref_check
      CHECK (ai_provider_pref IN ('google', 'openai'));
  END IF;
END $$;

COMMENT ON COLUMN public.consultants.ai_profile IS
  'Perfil de qualidade da IA. accuracy=Gemini 3.1 Pro/GPT-5.5 (mais precisao). balanced=Gemini 3.5 Flash/GPT-5 (default). fast=Gemini 2.5 Flash-Lite (mais barato).';

COMMENT ON COLUMN public.consultants.ai_provider_pref IS
  'Provedor de IA preferido. google=Gemini (mais barato, GA estavel). openai=GPT (latencia menor em alguns casos).';
