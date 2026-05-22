-- =====================================================================
-- WhatsApp Flow Reliability v2 — Production Rollout (Phase 8 / Task 41)
-- =====================================================================
-- Activates the v2 grounded path for every consultant, seeds the per-
-- consultant Gemini quota bucket, and ensures the global kill-switch
-- (`app_settings.bot_global_enabled`) exists and is set to TRUE so the
-- bot is allowed to respond by default.
--
-- Idempotent: safe to run multiple times. Every UPDATE/INSERT is gated
-- by IF NOT EXISTS or ON CONFLICT.
--
-- Rollback (in order of severity):
--   1. Per-consultant: UPDATE consultants SET flow_reliability_v2='off'
--                       WHERE id = '<uuid>';
--   2. Global v2 off: UPDATE consultants SET flow_reliability_v2='off';
--   3. Full kill:    UPDATE app_settings SET bot_global_enabled=false
--                       WHERE id='global';
--
-- The rollback for (1) and (2) propagates within ~30s due to the
-- in-memory cache in `_shared/feature-flag.ts` (FEATURE_FLAG_CACHE_TTL_MS).
-- The kill-switch (3) propagates within ~5s
-- (`_shared/bot/global-flag.ts`).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Global kill-switch row.
-- ---------------------------------------------------------------------
-- `app_settings` is the single-row table consulted by every webhook
-- before it does anything. The `id='global'` PK convention is the
-- contract used by `_shared/bot/global-flag.ts:isBotGloballyEnabled`.
-- We seed it idempotently so a fresh environment doesn't require a
-- manual UPDATE before the bot can speak.
INSERT INTO public.app_settings (id, bot_global_enabled, resolver_strict_mode)
VALUES ('global', true, false)
ON CONFLICT (id) DO UPDATE
  SET bot_global_enabled  = COALESCE(public.app_settings.bot_global_enabled, true),
      resolver_strict_mode = COALESCE(public.app_settings.resolver_strict_mode, false);

-- ---------------------------------------------------------------------
-- 2) Flip every consultant onto the v2 grounded path.
-- ---------------------------------------------------------------------
-- The column was added with default 'off' by 20260521170000. We move
-- everyone to 'on' (canary period was deliberately skipped per the
-- launch decision: full rollout with kill-switch fallback). Consultants
-- created AFTER this migration still default to 'off' — the trigger
-- below promotes them automatically, so newly-onboarded consultants
-- get the grounded path from day one.
UPDATE public.consultants
   SET flow_reliability_v2 = 'on'
 WHERE flow_reliability_v2 <> 'on';

-- Promote any consultant created later to 'on'. We use a BEFORE INSERT
-- trigger (not a default) so we can set it conditionally based on the
-- column value the user explicitly passed in (e.g., 'off' for opt-out).
CREATE OR REPLACE FUNCTION public.consultants_set_flow_reliability_v2_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only override when the caller relied on the column default.
  IF NEW.flow_reliability_v2 IS NULL OR NEW.flow_reliability_v2 = 'off' THEN
    NEW.flow_reliability_v2 := 'on';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consultants_flow_reliability_v2_default
  ON public.consultants;

CREATE TRIGGER consultants_flow_reliability_v2_default
  BEFORE INSERT ON public.consultants
  FOR EACH ROW
  EXECUTE FUNCTION public.consultants_set_flow_reliability_v2_default();

COMMENT ON TRIGGER consultants_flow_reliability_v2_default ON public.consultants IS
  'Auto-promotes new consultants to flow_reliability_v2=''on''. Override by setting an explicit value at INSERT time.';

-- ---------------------------------------------------------------------
-- 3) Seed the per-consultant Gemini quota bucket.
-- ---------------------------------------------------------------------
-- The bucket is created lazily by `consume_gemini_token` on first use,
-- but seeding here gives every existing consultant a full bucket up
-- front so the very first inbound after deploy doesn't burn a token
-- on bucket creation. Default capacity (60 tokens, 60/min refill) is
-- intentionally generous: a normal lead conversation uses ≤ 1 token
-- per inbound, so a single consultant can sustain 60 inbounds/min
-- before throttling. Above that, callers see GeminiQuotaExhausted and
-- fall back deterministically (no hallucinations, no silence).
INSERT INTO public.gemini_quota_bucket (consultant_id, tokens, capacity, refill_per_minute, refilled_at)
SELECT id, 60, 60, 60, now()
  FROM public.consultants
ON CONFLICT (consultant_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4) Audit trail: log this rollout in ai_agent_logs once.
-- ---------------------------------------------------------------------
-- Helps `bot-health-intel` (and a human reader of the table) correlate
-- behavior changes with the rollout date. Single row per consultant,
-- idempotent via the (consultant_id, error) lookup.
INSERT INTO public.ai_agent_logs (
  consultant_id, customer_id, phone, step_before, step_after,
  error, llm_output, handoff, latency_ms
)
SELECT
  c.id,
  NULL,
  NULL,
  'rollout',
  'rollout',
  'flow_reliability_v2_rollout',
  jsonb_build_object(
    'rollout',         'flow_reliability_v2',
    'previous_value',  'off',
    'new_value',       'on',
    'rollout_at',      now()
  ),
  false,
  0
  FROM public.consultants c
 WHERE NOT EXISTS (
   SELECT 1 FROM public.ai_agent_logs l
    WHERE l.consultant_id = c.id
      AND l.error = 'flow_reliability_v2_rollout'
 );
