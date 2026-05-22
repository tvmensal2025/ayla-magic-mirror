-- ============================================================================
-- WhatsApp Flow Reliability v2 (bugfix spec: whatsapp-flow-reliability-fix)
-- ============================================================================
-- Implements design.md §4. Idempotent (IF NOT EXISTS / OR REPLACE / DO blocks).
-- Safe to re-run.
--
-- Deviations from design.md §4 (compatibility with existing schema):
--   §4.7  webhook_message_dedup: existing constraint on message_id is the
--         PRIMARY KEY (webhook_message_dedup_pkey), not a UNIQUE *_key.
--         A composite UNIQUE (message_id, instance_name) was already added
--         by 20260519124511 as webhook_message_dedup_unique. Here we drop
--         the PK so two instances can dedupe the same message_id.
--   §4.8  Design references "media_send_log"; the canonical table in this
--         repository is ai_slot_dispatch_log (created in 20260513125047
--         and used by try_log_media_send). dispatch_status already exists
--         (20260513130850). The existing UNIQUE is the partial index
--         ux_ai_slot_dispatch_log_customer_media ON (customer_id, media_id)
--         WHERE media_id IS NOT NULL — used as the ON CONFLICT target in
--         reserve_media_send. The RPC populates the required NOT NULL
--         columns (slot_key, variant) on insert.
--   §4.10 design.md proposed
--           md5(lower(regexp_replace(coalesce(message_text,''),'\s+',' ','g')))
--         for the GENERATED column `conversations.message_text_hash`.
--         Implementation uses SHA-256 truncated to 32 hex characters
--         instead, plus a `btrim()` to strip leading/trailing
--         whitespace. The reasons:
--           1. Deno's Web Crypto (Edge Function runtime) does NOT expose
--              MD5; it would force shipping a userland MD5 to mirror the
--              column from JS. Truncated SHA-256 is supported natively
--              in both Deno and Node and is computed by `text-hash.ts`.
--           2. The hash is only used as an equality probe for short-
--              window dedup — a 128-bit prefix of SHA-256 has at least
--              the collision resistance of MD5 at the same width.
--           3. `btrim()` mirrors `String#trim()` in JS, which the
--              JS-side normalizer applies after collapsing whitespace
--              runs. Without it the two sides would disagree on
--              "  hello  " vs "hello".
--         pgcrypto provides `digest(..., 'sha256')`; the extension is
--         already required for `gen_random_uuid` below. Pre-existing
--         rows (inserted before this column was created) get their
--         hash computed lazily by the GENERATED clause on next write.
--
-- The Supabase migration runner wraps this file in a transaction; no
-- explicit BEGIN/COMMIT is used, matching the convention of other
-- migrations in this directory.
-- ============================================================================

-- pgcrypto for gen_random_uuid (already enabled by Supabase; idempotent guard).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 4.1 inbound_media_failures: persistent log of media-download failures
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inbound_media_failures (
  id            BIGSERIAL PRIMARY KEY,
  customer_id   UUID NOT NULL,
  consultant_id UUID NOT NULL,
  message_id    TEXT NOT NULL,
  reason        TEXT NOT NULL,
  raw_payload   JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbound_media_failures_customer_idx
  ON public.inbound_media_failures (customer_id, created_at DESC);

ALTER TABLE public.inbound_media_failures ENABLE ROW LEVEL SECURITY;
-- No policies: service_role bypasses RLS; clients are blocked.

-- ============================================================================
-- 4.2 inbound_media_retry: queue for MinIO upload retry with TTL
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inbound_media_retry (
  id              BIGSERIAL PRIMARY KEY,
  customer_id     UUID NOT NULL,
  consultant_id   UUID NOT NULL,
  message_id      TEXT NOT NULL,
  media_kind      TEXT NOT NULL,
  base64          TEXT NOT NULL,
  mime_type       TEXT,
  attempts        INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  succeeded_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbound_media_retry_pending_idx
  ON public.inbound_media_retry (next_attempt_at)
  WHERE succeeded_at IS NULL;

ALTER TABLE public.inbound_media_retry ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4.3 outbound_message_log: idempotency keys for sendWithRetry
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.outbound_message_log (
  idempotency_key      TEXT PRIMARY KEY,
  customer_id          UUID NOT NULL,
  consultant_id        UUID NOT NULL,
  payload_hash         TEXT NOT NULL,
  result_status        TEXT,
  evolution_message_id TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbound_message_log_customer_idx
  ON public.outbound_message_log (customer_id, created_at DESC);

ALTER TABLE public.outbound_message_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4.4 webhook_rate_limit: persistent rate limit (replaces in-memory Map)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.webhook_rate_limit (
  phone        TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT NOT NULL DEFAULT 1,
  PRIMARY KEY (phone, window_start)
);

CREATE INDEX IF NOT EXISTS webhook_rate_limit_window_idx
  ON public.webhook_rate_limit (window_start);

ALTER TABLE public.webhook_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.try_acquire_rate_limit(
  p_phone      TEXT,
  p_window_ms  INT,
  p_max_count  INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count        INT;
BEGIN
  -- Bucket the current instant to a window of size p_window_ms.
  v_window_start := date_trunc('second', now())
    - ((EXTRACT(MILLISECONDS FROM now())::int % p_window_ms) * interval '1 millisecond');

  INSERT INTO public.webhook_rate_limit (phone, window_start, count)
  VALUES (p_phone, v_window_start, 1)
  ON CONFLICT (phone, window_start) DO UPDATE
    SET count = public.webhook_rate_limit.count + 1
  RETURNING count INTO v_count;

  RETURN v_count <= p_max_count;
END;
$$;

-- ============================================================================
-- 4.5 ai_cooldown_state: shared cooldown (replaces in-memory Map)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ai_cooldown_state (
  cooldown_key TEXT PRIMARY KEY,
  until_at     TIMESTAMPTZ NOT NULL,
  reason       TEXT
);

ALTER TABLE public.ai_cooldown_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ai_cooldown_check_and_set(
  p_key     TEXT,
  p_ttl_ms  INT,
  p_reason  TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_until TIMESTAMPTZ;
BEGIN
  SELECT until_at INTO v_until
    FROM public.ai_cooldown_state
   WHERE cooldown_key = p_key;

  IF v_until IS NOT NULL AND v_until > now() THEN
    RETURN false;
  END IF;

  INSERT INTO public.ai_cooldown_state (cooldown_key, until_at, reason)
  VALUES (p_key, now() + (p_ttl_ms || ' milliseconds')::interval, p_reason)
  ON CONFLICT (cooldown_key) DO UPDATE
    SET until_at = EXCLUDED.until_at,
        reason   = EXCLUDED.reason;

  RETURN true;
END;
$$;

-- ============================================================================
-- 4.6 gemini_quota_bucket: token bucket per consultant for Gemini calls
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.gemini_quota_bucket (
  consultant_id     UUID PRIMARY KEY,
  tokens            INT NOT NULL DEFAULT 60,
  capacity          INT NOT NULL DEFAULT 60,
  refill_per_minute INT NOT NULL DEFAULT 60,
  refilled_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gemini_quota_bucket ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_gemini_token(
  p_consultant UUID,
  p_tokens     INT DEFAULT 1
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row          public.gemini_quota_bucket%ROWTYPE;
  v_elapsed_min  NUMERIC;
  v_new_tokens   INT;
BEGIN
  -- Ensure a bucket row exists for this consultant.
  INSERT INTO public.gemini_quota_bucket (consultant_id)
  VALUES (p_consultant)
  ON CONFLICT (consultant_id) DO NOTHING;

  SELECT * INTO v_row
    FROM public.gemini_quota_bucket
   WHERE consultant_id = p_consultant
   FOR UPDATE;

  v_elapsed_min := EXTRACT(EPOCH FROM (now() - v_row.refilled_at)) / 60.0;
  v_new_tokens  := LEAST(
    v_row.capacity,
    v_row.tokens + (v_elapsed_min * v_row.refill_per_minute)::int
  );

  IF v_new_tokens < p_tokens THEN
    UPDATE public.gemini_quota_bucket
       SET tokens      = v_new_tokens,
           refilled_at = now()
     WHERE consultant_id = p_consultant;
    RETURN false;
  END IF;

  UPDATE public.gemini_quota_bucket
     SET tokens      = v_new_tokens - p_tokens,
         refilled_at = now()
   WHERE consultant_id = p_consultant;

  RETURN true;
END;
$$;

-- ============================================================================
-- 4.7 webhook_message_dedup: composite UNIQUE (message_id, instance_name)
-- ============================================================================
-- The existing schema has message_id as PRIMARY KEY, which prevents two
-- different instances from independently deduping the same message_id.
-- A composite UNIQUE was already added by 20260519124511; here we drop the
-- single-column PK so the composite UNIQUE becomes the effective dedup key.
DO $$
BEGIN
  -- Drop the PK if present so two instances can dedupe the same message_id.
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'webhook_message_dedup_pkey'
       AND conrelid = 'public.webhook_message_dedup'::regclass
  ) THEN
    ALTER TABLE public.webhook_message_dedup
      DROP CONSTRAINT webhook_message_dedup_pkey;
  END IF;

  -- Defensive: drop a *_message_id_key UNIQUE if it ever existed
  -- (matches the literal name used in design.md §4.7).
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'webhook_message_dedup_message_id_key'
       AND conrelid = 'public.webhook_message_dedup'::regclass
  ) THEN
    ALTER TABLE public.webhook_message_dedup
      DROP CONSTRAINT webhook_message_dedup_message_id_key;
  END IF;
END $$;

-- Composite UNIQUE index (idempotent). 20260519124511 added a UNIQUE
-- constraint with the same columns under name webhook_message_dedup_unique;
-- this index is created only if it does not already exist.
CREATE UNIQUE INDEX IF NOT EXISTS webhook_message_dedup_msg_inst_uniq
  ON public.webhook_message_dedup (message_id, instance_name);

-- ============================================================================
-- 4.8 ai_slot_dispatch_log (canonical "media_send_log"):
--     reservation_id / reserved_at / confirmed_at + reserve/confirm RPCs
-- ============================================================================
-- dispatch_status already exists (20260513130850).
ALTER TABLE public.ai_slot_dispatch_log
  ADD COLUMN IF NOT EXISTS dispatch_status TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS reservation_id  UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS reserved_at     TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS confirmed_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ai_slot_dispatch_log_reservation_idx
  ON public.ai_slot_dispatch_log (reservation_id)
  WHERE reservation_id IS NOT NULL;

-- Reserve a slot. Conflicts use the existing partial UNIQUE index
-- ux_ai_slot_dispatch_log_customer_media (customer_id, media_id)
-- WHERE media_id IS NOT NULL. If a reservation older than 30s is still
-- unconfirmed, it is recycled; if already 'sent', it stays 'sent'.
CREATE OR REPLACE FUNCTION public.reserve_media_send(
  p_cons   UUID,
  p_cust   UUID,
  p_media  UUID,
  p_slot_key TEXT DEFAULT 'unknown',
  p_kind     TEXT DEFAULT 'media'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_cust IS NULL OR p_media IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ai_slot_dispatch_log
    (consultant_id, customer_id, media_id, slot_key, variant,
     dispatch_status, reservation_id, reserved_at, sent_at)
  VALUES
    (COALESCE(p_cons, '00000000-0000-0000-0000-000000000000'::uuid),
     p_cust, p_media, COALESCE(p_slot_key, 'unknown'),
     'personal', 'reserved', gen_random_uuid(), now(), now())
  ON CONFLICT (customer_id, media_id) WHERE media_id IS NOT NULL
  DO UPDATE SET
    -- Only release/recycle when the previous reservation is stale.
    dispatch_status = CASE
      WHEN public.ai_slot_dispatch_log.dispatch_status = 'sent'        THEN 'sent'
      WHEN public.ai_slot_dispatch_log.reserved_at IS NULL             THEN 'reserved'
      WHEN public.ai_slot_dispatch_log.reserved_at
             < now() - interval '30 seconds'                           THEN 'reserved'
      ELSE public.ai_slot_dispatch_log.dispatch_status
    END,
    reservation_id = CASE
      WHEN public.ai_slot_dispatch_log.dispatch_status = 'sent'        THEN public.ai_slot_dispatch_log.reservation_id
      WHEN public.ai_slot_dispatch_log.reserved_at IS NULL
        OR public.ai_slot_dispatch_log.reserved_at
             < now() - interval '30 seconds'                           THEN gen_random_uuid()
      ELSE public.ai_slot_dispatch_log.reservation_id
    END,
    reserved_at = CASE
      WHEN public.ai_slot_dispatch_log.dispatch_status = 'sent'        THEN public.ai_slot_dispatch_log.reserved_at
      WHEN public.ai_slot_dispatch_log.reserved_at IS NULL
        OR public.ai_slot_dispatch_log.reserved_at
             < now() - interval '30 seconds'                           THEN now()
      ELSE public.ai_slot_dispatch_log.reserved_at
    END
  RETURNING reservation_id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_media_send(
  p_res_id UUID,
  p_ok     BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_res_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.ai_slot_dispatch_log
     SET dispatch_status = CASE WHEN p_ok THEN 'sent' ELSE 'failed' END,
         confirmed_at    = now()
   WHERE reservation_id = p_res_id;
END;
$$;

-- ============================================================================
-- 4.9 pending_outbound_media: queue for tail past 50s of media sequences
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pending_outbound_media (
  id            BIGSERIAL PRIMARY KEY,
  consultant_id UUID NOT NULL,
  customer_id   UUID NOT NULL,
  payload       JSONB NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts      INT NOT NULL DEFAULT 0,
  succeeded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pending_outbound_media_pending_idx
  ON public.pending_outbound_media (scheduled_for)
  WHERE succeeded_at IS NULL;

ALTER TABLE public.pending_outbound_media ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4.10 conversations.message_text_hash: normalized hash for anti-duplication
-- ============================================================================
-- The hash is computed as the first 32 hex chars of
-- SHA-256(btrim(regexp_replace(lower(coalesce(message_text,'')),
--                              '\s+', ' ', 'g'))).
-- This matches the JS-side `computeMessageTextHash` in
-- supabase/functions/_shared/text-hash.ts byte-for-byte. See header note
-- (§4.10 deviations) for the rationale (Web Crypto in Deno does not
-- support MD5; truncated SHA-256 is equivalent for dedup).
--
-- Idempotency: the column may already exist on a previous deploy with the
-- earlier MD5 expression. We DROP IF EXISTS and recreate so the GENERATED
-- expression is replaced with the new SHA-256 form. Both the column and
-- its supporting index are GENERATED-derived; rebuilding is cheap.
ALTER TABLE public.conversations
  DROP COLUMN IF EXISTS message_text_hash;

ALTER TABLE public.conversations
  ADD COLUMN message_text_hash TEXT
  GENERATED ALWAYS AS (
    substring(
      encode(
        digest(
          btrim(regexp_replace(lower(coalesce(message_text, '')), '\s+', ' ', 'g')),
          'sha256'::text
        ),
        'hex'
      ),
      1, 32
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS conversations_dup_hash_idx
  ON public.conversations (customer_id, conversation_step, message_text_hash, created_at DESC);

-- ============================================================================
-- 4.11 consultants.flow_reliability_v2: rollout feature flag
-- ============================================================================
ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS flow_reliability_v2 TEXT NOT NULL DEFAULT 'off';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'consultants_flow_reliability_v2_chk'
       AND conrelid = 'public.consultants'::regclass
  ) THEN
    ALTER TABLE public.consultants
      ADD CONSTRAINT consultants_flow_reliability_v2_chk
      CHECK (flow_reliability_v2 IN ('off', 'dark', 'canary', 'on'));
  END IF;
END $$;

COMMENT ON COLUMN public.consultants.flow_reliability_v2 IS
  'Rollout flag for the WhatsApp Flow Reliability v2 bugfix. Values: off (current path), dark (compute-but-do-not-emit), canary (5% / whitelist), on (full rollout). Rollback: UPDATE consultants SET flow_reliability_v2=''off''.';

-- ============================================================================
-- 4.12 customer_processing_lock: row-based "soft" serialization per customer
-- ============================================================================
-- Goal (bugfix conditions 2.11, 2.37): serialize webhook processing for the
-- same customer_id while keeping different customers parallel. A true
-- pg_advisory_xact_lock cannot be held across multiple PostgREST calls from
-- a Deno Edge Function (each call is a separate HTTP request, separate
-- connection), so we implement an UPSERT-based lock with TTL safety
-- against orphaned holders. Acquire via try_acquire_customer_lock; release
-- via release_customer_lock matching the lock_token.
CREATE TABLE IF NOT EXISTS public.customer_processing_lock (
  customer_id  UUID PRIMARY KEY,
  locked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ NOT NULL,
  lock_token   UUID NOT NULL
);

ALTER TABLE public.customer_processing_lock ENABLE ROW LEVEL SECURITY;
-- No policies: service_role bypasses RLS; clients are blocked.

-- Try to acquire the lock for p_customer with a TTL of p_ttl_ms milliseconds.
-- Returns the new lock_token on success, NULL when another holder owns a
-- non-expired lock. Two-step strategy:
--   1. INSERT ... ON CONFLICT DO NOTHING: succeeds when no row exists.
--   2. UPDATE ... WHERE locked_until < now(): steals an expired lock.
-- FOUND tracks the row count of the last DML (Postgres semantics), so each
-- step's outcome is checked independently.
CREATE OR REPLACE FUNCTION public.try_acquire_customer_lock(
  p_customer UUID,
  p_ttl_ms   INT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token UUID;
BEGIN
  IF p_customer IS NULL THEN
    RETURN NULL;
  END IF;

  v_token := gen_random_uuid();

  -- Fast path: row missing → insert wins.
  INSERT INTO public.customer_processing_lock
    (customer_id, locked_at, locked_until, lock_token)
  VALUES
    (p_customer, now(),
     now() + (p_ttl_ms || ' milliseconds')::interval,
     v_token)
  ON CONFLICT (customer_id) DO NOTHING;

  IF FOUND THEN
    RETURN v_token;
  END IF;

  -- Slow path: a row exists; steal it only when the previous holder's TTL
  -- has elapsed. The WHERE clause is evaluated atomically with the UPDATE.
  UPDATE public.customer_processing_lock
     SET locked_at    = now(),
         locked_until = now() + (p_ttl_ms || ' milliseconds')::interval,
         lock_token   = v_token
   WHERE customer_id = p_customer
     AND locked_until < now();

  IF FOUND THEN
    RETURN v_token;
  END IF;

  -- Lock held by someone else and not yet expired.
  RETURN NULL;
END;
$$;

-- Release the lock if (and only if) the caller still owns the token.
-- Returns true when a row was deleted, false otherwise (someone else's
-- token, or already released, or TTL expired and stolen).
CREATE OR REPLACE FUNCTION public.release_customer_lock(
  p_customer UUID,
  p_token    UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_customer IS NULL OR p_token IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.customer_processing_lock
   WHERE customer_id = p_customer
     AND lock_token  = p_token;

  RETURN FOUND;
END;
$$;
