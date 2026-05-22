// Per-customer processing lock for the WhatsApp Flow Reliability v2 bugfix
// (`whatsapp-flow-reliability-fix`, design §3.2 / §5 and tasks 4 / 6).
//
// Goal: serialize webhook processing for a single customer while letting
// different customers run in parallel. The bugfix conditions 2.11 and 2.37
// describe this as `pg_advisory_xact_lock(hashtext(customer_id))`, but a
// true advisory lock cannot be held across multiple PostgREST round-trips
// from a Deno Edge Function — each `supabase.from(...)` / `supabase.rpc(...)`
// is a separate HTTP request and a separate database session. We can only
// hold an advisory lock inside one SQL function call, and our `fn` is
// JavaScript that needs to issue many calls.
//
// So we implement a row-based "soft" lock with TTL safety:
//
//   try_acquire_customer_lock(p_customer, p_ttl_ms) → uuid (token) | null
//   release_customer_lock(p_customer, p_token)      → bool
//
// Both RPCs live in the v2 migration. The Edge function holds the lock for
// the duration of `fn()`, then releases it in a `finally` block. The TTL
// (default 8 s, matching the design's statement_timeout for one turn)
// guarantees that a crashed holder cannot keep other webhooks blocked.
//
// `withCustomerLock` never throws. On failure it returns a structured
// negative result so callers can short-circuit to a neutral 200 (no
// effects) and log `customer_lock_timeout`.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Public API ──────────────────────────────────────────────────────────

export interface WithCustomerLockOptions {
  /**
   * Lock TTL in milliseconds. Defaults to 8 000 (matches the "statement
   * timeout of 8 s per turn" target in the design). The TTL is enforced
   * by the database; if the holder dies, another caller can steal the
   * lock after `ttlMs` elapsed.
   */
  ttlMs?: number;
  /**
   * How long to keep retrying acquisition before giving up. Defaults to 0,
   * which means "no waiting" — if the lock is held, return `timeout`
   * immediately. Callers that prefer to serialize (and accept the latency
   * cost) can pass e.g. 4 000.
   */
  maxWaitMs?: number;
  /**
   * Polling interval while waiting for an existing holder to release.
   * Defaults to 50 ms. Ignored when `maxWaitMs <= 0`.
   */
  pollIntervalMs?: number;
}

export type CustomerLockResult<T> =
  | { acquired: true; result: T }
  | { acquired: false; reason: "timeout" | "error" };

const DEFAULT_TTL_MS = 8_000;
const DEFAULT_MAX_WAIT_MS = 0;
const DEFAULT_POLL_INTERVAL_MS = 50;

/**
 * Runs `fn` while holding the per-customer lock for `customerId`. If the
 * lock cannot be acquired within `maxWaitMs`, returns
 * `{ acquired: false, reason: 'timeout' }` and emits a structured
 * `customer_lock_timeout` log line — the caller is expected to translate
 * that into a neutral 200 response (no side effects).
 *
 * Implementation notes:
 *   - The lock is obtained via the `try_acquire_customer_lock` RPC. On
 *     success Postgres returns a `lock_token` UUID; on failure, NULL.
 *   - The lock is always released via `release_customer_lock`, even when
 *     `fn` throws. The token guards against accidentally releasing a lock
 *     stolen by someone else after a TTL expiration.
 *   - This function never throws. Errors from RPC calls are caught,
 *     logged, and surfaced as `{ acquired: false, reason: 'error' }`.
 *   - When `maxWaitMs > 0`, polling uses a fixed interval (no jitter is
 *     needed at the small scale we care about — Postgres-backed locks
 *     and short TTLs).
 */
export async function withCustomerLock<T>(
  supabase: SupabaseClient,
  customerId: string,
  fn: () => Promise<T>,
  options: WithCustomerLockOptions = {},
): Promise<CustomerLockResult<T>> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  if (!customerId) {
    // Without a customer key we cannot serialize anything. Best behavior
    // is to skip locking and run the work directly — same as the legacy
    // path. We surface success so callers do not 200-noop on edge cases.
    try {
      const result = await fn();
      return { acquired: true, result };
    } catch (e) {
      console.error(
        JSON.stringify({
          kind: "customer_lock_error",
          customer_id: null,
          message: e instanceof Error ? e.message : String(e),
        }),
      );
      return { acquired: false, reason: "error" };
    }
  }

  const startedAt = Date.now();
  let token: string | null = null;

  while (true) {
    try {
      const { data, error } = await supabase.rpc(
        "try_acquire_customer_lock",
        { p_customer: customerId, p_ttl_ms: ttlMs },
      );
      if (error) {
        console.error(
          JSON.stringify({
            kind: "customer_lock_error",
            customer_id: customerId,
            stage: "acquire",
            code: (error as any).code ?? null,
            message: error.message,
          }),
        );
        return { acquired: false, reason: "error" };
      }
      // Postgres function returning UUID surfaces as a string (or null).
      if (typeof data === "string" && data.length > 0) {
        token = data;
        break;
      }
    } catch (e) {
      console.error(
        JSON.stringify({
          kind: "customer_lock_error",
          customer_id: customerId,
          stage: "acquire",
          message: e instanceof Error ? e.message : String(e),
        }),
      );
      return { acquired: false, reason: "error" };
    }

    const waited = Date.now() - startedAt;
    if (waited >= maxWaitMs) {
      console.warn(
        JSON.stringify({
          kind: "customer_lock_timeout",
          customer_id: customerId,
          waited_ms: waited,
          ttl_ms: ttlMs,
          max_wait_ms: maxWaitMs,
        }),
      );
      return { acquired: false, reason: "timeout" };
    }

    // Sleep until the next poll, capped by remaining budget so we don't
    // overshoot maxWaitMs by more than a tick.
    const remaining = maxWaitMs - waited;
    await sleep(Math.min(pollIntervalMs, remaining));
  }

  // Acquired — run the work. Always release.
  try {
    const result = await fn();
    return { acquired: true, result };
  } catch (e) {
    console.error(
      JSON.stringify({
        kind: "customer_lock_error",
        customer_id: customerId,
        stage: "fn",
        message: e instanceof Error ? e.message : String(e),
      }),
    );
    return { acquired: false, reason: "error" };
  } finally {
    try {
      const { error } = await supabase.rpc("release_customer_lock", {
        p_customer: customerId,
        p_token: token,
      });
      if (error) {
        console.warn(
          JSON.stringify({
            kind: "customer_lock_error",
            customer_id: customerId,
            stage: "release",
            code: (error as any).code ?? null,
            message: error.message,
          }),
        );
      }
    } catch (e) {
      console.warn(
        JSON.stringify({
          kind: "customer_lock_error",
          customer_id: customerId,
          stage: "release",
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
