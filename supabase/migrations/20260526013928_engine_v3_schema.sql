-- ============================================================================
-- Spec: flow-engine-v3-rewrite (Task 1)
--   .kiro/specs/flow-engine-v3-rewrite/{requirements.md,design.md,tasks.md}
--
-- Intent: Non-destructive schema additions required by Engine v3 (the rewritten
-- pure-function bot conversational engine `runEngine` in
-- `supabase/functions/_shared/flow-engine/v3-runner.ts`).
--
-- This migration ONLY adds columns and creates one new table. It does NOT
-- drop, alter, or restructure any existing column or table. All statements
-- are idempotent (IF NOT EXISTS) so the migration is safely re-runnable
-- and preserves all existing data.
--
-- Additions:
--   1. consultants.use_engine_v3            BOOLEAN  — per-consultor rollout
--                                                      flag for the v3 router
--                                                      (Requirements 11.1).
--   2. customer_flow_state.last_outbound_content_hash  TEXT  — cross-turn
--                                                      dedupe state used by
--                                                      runEngine to enforce
--                                                      guarantee G1
--                                                      (Requirements 2.3).
--   3. bot_flow_steps.persuasive_text       TEXT     — optional variant-B
--                                                      persuasive copy
--                                                      (Requirements 5.4,
--                                                      16.2, 16.3).
--   4. engine_logs                          TABLE    — append-only structured
--                                                      decision log per turn
--                                                      (Requirements 14.1,
--                                                      14.3) plus indexes for
--                                                      per-customer recency
--                                                      and per-kind metrics.
--
-- Note on the existing `consultants.flow_engine_v3 TEXT` column (added by
-- migration 20260524112000_flow_engine_v3_flag.sql for a sibling spec):
-- that column is preserved and unrelated. THIS spec's design specifies a
-- separate boolean `use_engine_v3` flag (per design "Data Models" §SQL block
-- and Requirement 11.1) so we add a new column rather than reusing the
-- string-valued one.
-- ============================================================================

-- ─── 1. consultants.use_engine_v3 ──────────────────────────────────────────
ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS use_engine_v3 BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.consultants.use_engine_v3 IS
  'flow-engine-v3-rewrite: per-consultor rollout flag for runEngine v3. '
  'When TRUE, the engine-router dispatches inbound messages to the v3 pure '
  'runner instead of the legacy bot-flow handlers. Defaults to FALSE so the '
  'migration is non-destructive. Rollback: '
  'UPDATE consultants SET use_engine_v3 = FALSE WHERE id = ''<uuid>''.';

-- ─── 2. customer_flow_state.last_outbound_content_hash ─────────────────────
ALTER TABLE public.customer_flow_state
  ADD COLUMN IF NOT EXISTS last_outbound_content_hash TEXT;

COMMENT ON COLUMN public.customer_flow_state.last_outbound_content_hash IS
  'flow-engine-v3-rewrite: deterministic hash of the last OutboundMessage '
  'idempotencyContent emitted in the previous turn. Used by runEngine to '
  'enforce guarantee G1 (no duplicate outbounds) ACROSS turns by dropping a '
  'leading outbound whose hash matches this column when last_outbound_at is '
  'within 2 seconds. Nullable: NULL means no prior outbound.';

-- ─── 3. bot_flow_steps.persuasive_text ─────────────────────────────────────
ALTER TABLE public.bot_flow_steps
  ADD COLUMN IF NOT EXISTS persuasive_text TEXT;

COMMENT ON COLUMN public.bot_flow_steps.persuasive_text IS
  'flow-engine-v3-rewrite: optional persuasive copy used by variant B '
  '(no-audio strategy). Engine treats missing column, NULL, and empty '
  'string identically as "not provided" and falls back to message_text '
  '(Requirement 16.3). Variant A and D ignore this column.';

-- ─── 4. engine_logs ────────────────────────────────────────────────────────
-- Append-only structured-log sink. One row per StructuredLog produced by
-- runEngine, batched into a single INSERT by the dispatcher per turn.
-- See design §"Data Models" SQL block.
CREATE TABLE IF NOT EXISTS public.engine_logs (
  id           BIGSERIAL    PRIMARY KEY,
  at           TIMESTAMPTZ  NOT NULL,
  kind         TEXT         NOT NULL,
  customer_id  UUID         NOT NULL REFERENCES public.customers(id)        ON DELETE CASCADE,
  flow_id      UUID         NOT NULL REFERENCES public.bot_flows(id)        ON DELETE CASCADE,
  step_id      UUID                  REFERENCES public.bot_flow_steps(id)    ON DELETE SET NULL,
  payload      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  side_effect  JSONB
);

COMMENT ON TABLE public.engine_logs IS
  'flow-engine-v3-rewrite: append-only structured decision log emitted by '
  'runEngine, persisted by v3-dispatcher. Drives rollout metrics (G1–G6 '
  'violation rates) computed by flow-engine-rollout-cron. One row per '
  'StructuredLog; "kind" enum matches LogKind in v3-types.ts.';

COMMENT ON COLUMN public.engine_logs.at IS
  'ISO-8601 timestamp from EngineConfig.now (engine never reads system clock).';

COMMENT ON COLUMN public.engine_logs.kind IS
  'LogKind enum string. Decision-log kinds (engine_transition_match, '
  'engine_repeat, engine_goto, engine_safe_text, engine_handoff, '
  'engine_ai_answer_deferred, engine_ai_decide_deferred, engine_no_match) '
  'satisfy guarantee G3: exactly one per turn.';

COMMENT ON COLUMN public.engine_logs.side_effect IS
  'Optional sentinel telling the dispatcher to perform a guaranteed side '
  'effect outside the engine. Currently {kind: "insert_handoff_alert", reason} '
  'and {kind: "increment_metric", metric}.';

-- Indexes for two main read patterns:
--   (a) "show me the last N decisions for customer X"  — per-customer recency
--   (b) "violation-rate dashboard"                      — per-kind recency
CREATE INDEX IF NOT EXISTS engine_logs_customer_at
  ON public.engine_logs (customer_id, at DESC);

CREATE INDEX IF NOT EXISTS engine_logs_kind_at
  ON public.engine_logs (kind, at DESC);
