-- ============================================================================
-- Runtime fixes encontrados na auditoria de 2026-05-25
-- Spec: análise honesta do "fluxo vai funcionar 100%?"
-- ============================================================================
-- Os dois bugs corrigidos aqui causam falhas SILENCIOSAS em produção:
--   §1 customers.status='worker_offline' viola customers_status_check
--   §2 bot_step_transitions não tem coluna 'reason' usada por respondAndReentry
--
-- Idempotente: tudo guardado por IF NOT EXISTS / DROP CONSTRAINT IF EXISTS.
-- ============================================================================

-- ─── §1 customers_status_check: aceitar todos os status que o código grava ──
-- Status que o código tenta gravar e a constraint atual (de 20260423191437) NÃO aceita:
--   worker_offline       → portal-worker.ts quando worker está offline / falhou 3x
--   awaiting_facial      → bot-flow.ts ao gerar link facial
--   awaiting_manual_submit → manual submission flow
--   portal_submitted     → após confirmação do worker
--   data_complete já estava presente; preservado.
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_status_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_status_check CHECK (
  status = ANY (ARRAY[
    'pending'::text,
    'data_complete'::text,
    'registered_igreen'::text,
    'contract_sent'::text,
    'approved'::text,
    'rejected'::text,
    'lead'::text,
    'awaiting_signature'::text,
    'devolutiva'::text,
    'portal_submitting'::text,
    'awaiting_otp'::text,
    'validating_otp'::text,
    'automation_failed'::text,
    'complete'::text,
    'abandoned'::text,
    'cadastro_concluido'::text,
    'stuck_finalizar'::text,
    'stuck_contact'::text,
    'email_pendente_revisao'::text,
    'contato_incompleto'::text,
    -- novos estados detectados na auditoria 2026-05-25
    'worker_offline'::text,
    'awaiting_facial'::text,
    'awaiting_manual_submit'::text,
    'portal_submitted'::text
  ])
);

-- ─── §2 bot_step_transitions.reason: telemetria de recovery/dedup/handoff ──
-- bot-flow.ts:589 (evolution) e :646 (whapi) escrevem `reason: 'recovery:...'`
-- mas a coluna nunca foi adicionada. Os INSERTs estão em try/catch silencioso,
-- então 100% das linhas de telemetria de recuperação foram para o lixo desde
-- que respondAndReentry foi introduzido. Adicionar como nullable mantém
-- backwards-compat (todos os call sites antigos sem reason passam NULL).
ALTER TABLE public.bot_step_transitions
  ADD COLUMN IF NOT EXISTS reason text;

CREATE INDEX IF NOT EXISTS bot_step_transitions_reason_idx
  ON public.bot_step_transitions (reason)
  WHERE reason IS NOT NULL;

COMMENT ON COLUMN public.bot_step_transitions.reason IS
  'Motivo da transição: recovery:<kind>:<source>, dedup:<reason>, handoff:<reason>, etc. Usado por respondAndReentry e _smartRepeat.';
