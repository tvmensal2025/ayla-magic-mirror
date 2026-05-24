-- ============================================================================
-- Phase B da spec whatsapp-flow-architecture-v3 — Estado canônico do lead.
-- Tasks B.1 (enums) + B.2 (tabela) + B.3 (backfill) + B.4 (trigger).
--
-- Esta migração:
--   1. Cria os enums `customer_flow_status` e `customer_pause_reason`.
--   2. Cria a tabela `customer_flow_state` com PK por customer.
--   3. Faz backfill a partir de `customers.bot_paused*` e `conversation_step`.
--   4. Cria o trigger AFTER INSERT/UPDATE em `customer_flow_state` que
--      sincroniza de volta para `customers.*` (durante a janela de migração
--      os crons antigos continuam lendo de `customers`, então o trigger é
--      essencial).
--
-- Idempotente: pode ser re-rodada (DO blocks com guards e ON CONFLICT).
-- Rollback: drop trigger + drop tabela + drop enums (sem perder dados em
-- `customers` porque o trigger é apenas v3 → legacy).
-- ============================================================================

-- ─── 1. Enums ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_flow_status') THEN
    CREATE TYPE public.customer_flow_status AS ENUM (
      'new',                -- ainda não recebeu primeira ação
      'running',            -- engine no comando
      'waiting_reply',      -- step ask_text ou ask_choice
      'waiting_media',      -- step ask_media
      'waiting_timer',      -- step com waitFor=timer agendado
      'paused_manual',      -- assumido por humano (customer-takeover)
      'paused_system',      -- engine/IA decidiu pausar
      'converted',          -- atingiu step convert
      'lost',               -- timeout / opt-out / valor_baixo
      'delegated_legacy'    -- step system_capture roda runBotFlow
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_pause_reason') THEN
    CREATE TYPE public.customer_pause_reason AS ENUM (
      'opt_out',
      'humano_assumiu',
      'lead_pediu_humano',
      'low_bill_value',
      'low_confidence_handoff',
      'lead_refused_softpause',
      'lead_nao_pronto',
      'lead_quer_pensar',
      'lead_nao_responde',
      'confused_after_retries',
      'muitas_duvidas',
      'muitas_duvidas_ia',
      'ai_handoff_duvidas',
      'ai_limit_atingido',
      'anti_loop',
      'silent_handoff_empty_reply',
      'gemini_quota_exhausted',
      'dados_incompletos_pos_loop',
      'custom_step_no_match_retries_exhausted',
      'ia_decidiu',
      'engine_error'
    );
  END IF;
END $$;

-- ─── 2. Tabela `customer_flow_state` ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_flow_state (
  customer_id        UUID PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  flow_id            UUID NOT NULL REFERENCES public.bot_flows(id) ON DELETE RESTRICT,
  current_step_id    UUID REFERENCES public.bot_flow_steps(id) ON DELETE SET NULL,
  status             public.customer_flow_status NOT NULL DEFAULT 'new',
  pause_reason       public.customer_pause_reason,
  pause_meta         JSONB DEFAULT '{}'::jsonb,
  retries            INT NOT NULL DEFAULT 0,
  entered_step_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ,
  assigned_human_id  UUID,
  last_inbound_at    TIMESTAMPTZ,
  last_outbound_at   TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Invariante: se está paused_manual, há humano vinculado.
  CONSTRAINT cfs_paused_manual_requires_human CHECK (
    status <> 'paused_manual' OR assigned_human_id IS NOT NULL
  ),
  -- Invariante: se está em estado de pausa/perda, tem motivo.
  CONSTRAINT cfs_pause_requires_reason CHECK (
    status NOT IN ('paused_manual','paused_system','lost') OR pause_reason IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_cfs_flow_status
  ON public.customer_flow_state (flow_id, status);

CREATE INDEX IF NOT EXISTS idx_cfs_status_updated
  ON public.customer_flow_state (status, updated_at DESC)
  WHERE status IN ('running','waiting_reply','waiting_media','waiting_timer');

CREATE INDEX IF NOT EXISTS idx_cfs_assigned_human
  ON public.customer_flow_state (assigned_human_id)
  WHERE assigned_human_id IS NOT NULL;

ALTER TABLE public.customer_flow_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own flow state" ON public.customer_flow_state;
CREATE POLICY "Owner reads own flow state" ON public.customer_flow_state
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_id AND c.consultant_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Super admin manages all flow state" ON public.customer_flow_state;
CREATE POLICY "Super admin manages all flow state" ON public.customer_flow_state
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Trigger de updated_at — usa a função padrão do projeto.
DROP TRIGGER IF EXISTS customer_flow_state_updated_at ON public.customer_flow_state;
CREATE TRIGGER customer_flow_state_updated_at
  BEFORE UPDATE ON public.customer_flow_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.customer_flow_state IS
  'Fonte única do estado conversacional do lead (Phase B do whatsapp-flow-architecture-v3). PK por customer — lead nunca está em dois fluxos simultaneamente. Crons legados ainda leem customers.bot_paused; o trigger sync_customer_flow_state mantém ambos coerentes.';

-- ─── 3. Backfill ─────────────────────────────────────────────────────────────
-- Para cada customer ativo, derivar `customer_flow_state` a partir das
-- colunas legadas. Mapeamento:
--   - bot_paused=true && assigned_human_id NOT NULL → 'paused_manual'
--   - bot_paused=true && assigned_human_id IS NULL  → 'paused_system'
--   - status='complete' || conversation_step='complete' → 'converted'
--   - status='rejected' || conversation_step='valor_baixo' → 'lost'
--   - opt_out (do_not_contact) → 'lost' com pause_reason='opt_out'
--   - todo o resto → 'running'
--
-- pause_reason deriva de `bot_paused_reason` quando é uma string conhecida.
-- Quando não casa, fica NULL (e o status não pode ser paused — caímos em
-- 'running'). Customers já completados/lost ficam com pause_reason coerente.
--
-- Idempotente: ON CONFLICT (customer_id) DO NOTHING. Re-rodar não duplica.

INSERT INTO public.customer_flow_state (
  customer_id,
  flow_id,
  current_step_id,
  status,
  pause_reason,
  assigned_human_id,
  entered_step_at,
  last_inbound_at,
  last_outbound_at
)
SELECT
  c.id,
  bf.id AS flow_id,
  -- step lookup por step_key (preserva prefixo 'flow:' se existir)
  (SELECT s.id FROM public.bot_flow_steps s
    WHERE s.flow_id = bf.id
      AND s.step_key = COALESCE(
        NULLIF(regexp_replace(c.conversation_step, '^flow:', ''), ''),
        c.conversation_step
      )
    LIMIT 1) AS current_step_id,
  CASE
    WHEN COALESCE(c.do_not_contact, false) = true THEN 'lost'::customer_flow_status
    WHEN c.status = 'complete' OR c.conversation_step = 'complete' THEN 'converted'::customer_flow_status
    WHEN c.status = 'rejected' OR c.conversation_step = 'valor_baixo' THEN 'lost'::customer_flow_status
    WHEN c.bot_paused = true AND c.assigned_human_id IS NOT NULL THEN 'paused_manual'::customer_flow_status
    WHEN c.bot_paused = true THEN 'paused_system'::customer_flow_status
    ELSE 'running'::customer_flow_status
  END AS status,
  CASE
    WHEN COALESCE(c.do_not_contact, false) = true THEN 'opt_out'::customer_pause_reason
    WHEN c.status = 'rejected' OR c.conversation_step = 'valor_baixo' THEN 'low_bill_value'::customer_pause_reason
    -- Cast da string legada para enum quando o valor é um membro válido.
    WHEN c.bot_paused = true AND c.bot_paused_reason IN (
      'opt_out','humano_assumiu','lead_pediu_humano','low_bill_value','low_confidence_handoff',
      'lead_refused_softpause','lead_nao_pronto','lead_quer_pensar','lead_nao_responde',
      'confused_after_retries','muitas_duvidas','muitas_duvidas_ia','ai_handoff_duvidas',
      'ai_limit_atingido','anti_loop','silent_handoff_empty_reply','gemini_quota_exhausted',
      'dados_incompletos_pos_loop','custom_step_no_match_retries_exhausted','ia_decidiu','engine_error'
    ) THEN c.bot_paused_reason::customer_pause_reason
    -- Se está pausado mas com motivo desconhecido, classificamos como 'ia_decidiu'
    -- (categoria mais inocente). Engine v3 vai sobrescrever no próximo turno.
    WHEN c.bot_paused = true THEN 'ia_decidiu'::customer_pause_reason
    ELSE NULL
  END AS pause_reason,
  c.assigned_human_id,
  COALESCE(c.last_step_advanced_at, c.created_at, now()) AS entered_step_at,
  c.last_bot_interaction_at,
  c.last_bot_reply_at
FROM public.customers c
JOIN public.bot_flows bf
  ON bf.consultant_id = c.consultant_id
 AND bf.is_active = true
WHERE c.consultant_id IS NOT NULL
  -- Se o consultor tem múltiplos fluxos ativos, pegamos só um — não
  -- criamos linha duplicada (PK garante).
ON CONFLICT (customer_id) DO NOTHING;

-- ─── 4. Trigger de sincronização (v3 → legacy) ──────────────────────────────
-- Mantém `customers.bot_paused`, `bot_paused_reason`, `assigned_human_id`
-- coerentes com `customer_flow_state` para que crons legados continuem
-- funcionando durante a janela de migração (Phase H atualiza esses crons).

CREATE OR REPLACE FUNCTION public.sync_customer_flow_state_to_customers()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.customers SET
    bot_paused        = (NEW.status IN ('paused_manual','paused_system')),
    bot_paused_reason = NEW.pause_reason::text,
    assigned_human_id = NEW.assigned_human_id
  WHERE id = NEW.customer_id
    AND (
      bot_paused IS DISTINCT FROM (NEW.status IN ('paused_manual','paused_system'))
      OR bot_paused_reason IS DISTINCT FROM NEW.pause_reason::text
      OR assigned_human_id IS DISTINCT FROM NEW.assigned_human_id
    );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_cfs_to_customers ON public.customer_flow_state;
CREATE TRIGGER trg_sync_cfs_to_customers
  AFTER INSERT OR UPDATE ON public.customer_flow_state
  FOR EACH ROW EXECUTE FUNCTION public.sync_customer_flow_state_to_customers();

COMMENT ON FUNCTION public.sync_customer_flow_state_to_customers() IS
  'v3 → legacy sync. Phase B Task 12 do whatsapp-flow-architecture-v3. Quando crons legados forem migrados (Phase H + 30d), este trigger pode ser dropado em Phase J.';
