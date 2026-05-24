-- ============================================================================
-- Phase C Tasks 15 + 16 (whatsapp-flow-architecture-v3) — Step types canônicos.
--
-- Adiciona colunas declarativas + backfill 100% dos rows existentes + CHECK
-- constraint NOT VALID. VALIDATE acontece no final, depois do backfill.
--
-- Não dropa `step_type` legado — fica como diagnóstico até Phase J.
-- ============================================================================

-- ─── 1. ALTER: colunas declarativas ──────────────────────────────────────────
ALTER TABLE public.bot_flow_steps
  ADD COLUMN IF NOT EXISTS step_type_canonical TEXT,
  ADD COLUMN IF NOT EXISTS choice_preferred    TEXT,    -- 'button' | 'list' | 'number'
  ADD COLUMN IF NOT EXISTS choice_options      JSONB,   -- [{id,title,description?}]
  ADD COLUMN IF NOT EXISTS pipeline_kind       TEXT,    -- 'cadastro_portal' | 'ocr_conta' | 'ocr_documento' | 'finalizar_cadastro'
  ADD COLUMN IF NOT EXISTS condition_expr      JSONB;   -- branch step

-- ─── 2. Backfill (idempotente via WHERE NULL) ────────────────────────────────
-- Mapeamento conforme design.md:
--   audio_slot                    → audio_slot
--   message + termina em ? + tem  → ask_choice
--     transitions
--   message (resto)               → text_message
--   question                      → ask_text
--   media_request                 → ask_media
--   cadastro                      → system_capture (pipeline=cadastro_portal)
--   capture_conta                 → system_capture (pipeline=ocr_conta)
--   capture_documento             → system_capture (pipeline=ocr_documento)
--   capture_email                 → ask_text
--   confirm_phone                 → ask_choice (preferred=button)
--   finalizar_cadastro            → system_capture (pipeline=finalizar_cadastro)
--   resto não-conhecido           → text_message (categoria mais inocente)

UPDATE public.bot_flow_steps SET step_type_canonical = CASE step_type
  WHEN 'audio_slot'         THEN 'audio_slot'
  WHEN 'message'            THEN
    CASE WHEN message_text LIKE '%?'
              AND jsonb_array_length(COALESCE(transitions, '[]'::jsonb)) > 0
         THEN 'ask_choice' ELSE 'text_message' END
  WHEN 'question'           THEN 'ask_text'
  WHEN 'media_request'      THEN 'ask_media'
  WHEN 'cadastro'           THEN 'system_capture'
  WHEN 'capture_conta'      THEN 'system_capture'
  WHEN 'capture_documento'  THEN 'system_capture'
  WHEN 'capture_email'      THEN 'ask_text'
  WHEN 'confirm_phone'      THEN 'ask_choice'
  WHEN 'finalizar_cadastro' THEN 'system_capture'
  ELSE 'text_message'
END
WHERE step_type_canonical IS NULL;

UPDATE public.bot_flow_steps SET pipeline_kind = CASE step_type
  WHEN 'cadastro'           THEN 'cadastro_portal'
  WHEN 'capture_conta'      THEN 'ocr_conta'
  WHEN 'capture_documento'  THEN 'ocr_documento'
  WHEN 'finalizar_cadastro' THEN 'finalizar_cadastro'
  ELSE NULL
END
WHERE pipeline_kind IS NULL
  AND step_type IN ('cadastro','capture_conta','capture_documento','finalizar_cadastro');

-- `confirm_phone` legado → ask_choice com botões sim/outro.
UPDATE public.bot_flow_steps
   SET choice_preferred = 'button',
       choice_options = '[
         {"id":"sim_phone","title":"✅ Sim, é meu"},
         {"id":"editar_phone","title":"📱 Outro número"}
       ]'::jsonb
 WHERE step_type = 'confirm_phone'
   AND choice_preferred IS NULL;

-- Para steps que viraram `ask_choice` por terminar em `?`, derivamos
-- `choice_options` dos botões pré-cadastrados em `captures._buttons`
-- quando existirem. Caso contrário deixamos NULL — UI do Flow Builder
-- vai forçar preenchimento (Phase G).
UPDATE public.bot_flow_steps SET choice_options = (
  SELECT jsonb_agg(jsonb_build_object('id', b->>'id', 'title', b->>'title'))
  FROM jsonb_array_elements(captures) c,
       jsonb_array_elements(COALESCE(c->'value','[]'::jsonb)) b
  WHERE c->>'field' = '_buttons'
)
WHERE step_type_canonical = 'ask_choice'
  AND choice_options IS NULL
  AND captures IS NOT NULL
  AND jsonb_typeof(captures) = 'array';

UPDATE public.bot_flow_steps
   SET choice_preferred = 'button'
 WHERE step_type_canonical = 'ask_choice'
   AND choice_preferred IS NULL
   AND choice_options IS NOT NULL;

-- ─── 3. CHECK constraint NOT VALID ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'bot_flow_steps_canonical_chk'
       AND conrelid = 'public.bot_flow_steps'::regclass
  ) THEN
    ALTER TABLE public.bot_flow_steps
      ADD CONSTRAINT bot_flow_steps_canonical_chk CHECK (step_type_canonical IN (
        'text_message','media_message','audio_slot','ask_text','ask_choice',
        'ask_media','branch','system_capture'
      )) NOT VALID;
  END IF;
END $$;

-- ─── 4. Task 16 — VALIDATE constraint ────────────────────────────────────────
-- Após backfill, validamos os rows existentes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'bot_flow_steps_canonical_chk'
       AND conrelid = 'public.bot_flow_steps'::regclass
       AND NOT convalidated
  ) THEN
    ALTER TABLE public.bot_flow_steps VALIDATE CONSTRAINT bot_flow_steps_canonical_chk;
  END IF;
END $$;

COMMENT ON COLUMN public.bot_flow_steps.step_type_canonical IS
  'Step type canônico (Phase C do whatsapp-flow-architecture-v3). Valores: text_message, media_message, audio_slot, ask_text, ask_choice, ask_media, branch, system_capture. step_type legado é só diagnóstico.';
COMMENT ON COLUMN public.bot_flow_steps.choice_preferred IS
  'Para ask_choice: button, list ou number. Engine consulta capabilities do canal e decide renderização.';
COMMENT ON COLUMN public.bot_flow_steps.choice_options IS
  'Para ask_choice: array de [{id,title,description?}]. Caller declara, dispatcher renderiza channel-aware.';
COMMENT ON COLUMN public.bot_flow_steps.pipeline_kind IS
  'Para system_capture: cadastro_portal | ocr_conta | ocr_documento | finalizar_cadastro. Engine emite delegate_legacy_runBotFlow com este reason.';
