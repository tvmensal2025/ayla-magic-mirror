// Idempotency helpers for outbound WhatsApp messages — bugfix
// `whatsapp-flow-reliability-fix`, design §3.2 / §4.3 (table
// `outbound_message_log`) and tasks 3 / 8.
//
// Goal: when `sendWithRetry` is invoked twice for the same logical turn
// (network retry, webhook redelivery, double-fire from advisory-lock loss)
// it must send to Evolution exactly once. The deduplication key is a
// content + step + minute hash; the lock is an INSERT ... ON CONFLICT in
// `outbound_message_log`. The first writer wins; everyone else short-
// circuits with the previous result.
//
// All functions in this module fail-open: any unexpected error is logged
// and the caller receives a safe default (no throws). The trade-off is
// stated explicitly in §3.2: a transient Postgres hiccup may briefly let a
// duplicate through, but it must never silence the customer.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Key derivation ──────────────────────────────────────────────────────

export interface IdempotencyKeyInput {
  /** Customer this turn belongs to. */
  customerId: string;
  /** `conversation_step` (or `flow:<step>`) at the time of send. */
  step: string;
  /** Canonical content string (text + media ids + audio slot, joined). */
  content: string;
  /**
   * Optional minute bucket — `floor(Date.now() / 60_000)` by default.
   * Exposed so callers (and tests) can pin the bucket explicitly.
   */
  minuteBucket?: number;
}

/**
 * Deterministic SHA-256 of `${customerId}|${step}|${content}|${minuteBucket}`,
 * encoded as base64url (URL- and Postgres-safe). Returns the same string for
 * the same input across calls and across processes.
 *
 * Implementation uses Web Crypto, which is available in Deno Edge Functions
 * and in Node ≥ 19 (used by tests in Deno).
 */
export async function computeIdempotencyKey(
  input: IdempotencyKeyInput,
): Promise<string> {
  const bucket = typeof input.minuteBucket === "number"
    ? input.minuteBucket
    : Math.floor(Date.now() / 60_000);

  const canonical = `${input.customerId}|${input.step}|${input.content}|${bucket}`;
  const bytes = new TextEncoder().encode(canonical);

  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return base64UrlEncode(new Uint8Array(digest));
  } catch (e) {
    // Crypto subsystem unavailable — collapse to a conservative tag that is
    // still deterministic for the same input but not cryptographically
    // strong. Keeps the contract (same input → same key).
    console.warn("[idempotency] subtle.digest failed; using fallback tag", e);
    return `fallback-${djb2(canonical).toString(16)}`;
  }
}

/** RFC 4648 §5 base64url, no padding. */
function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // btoa is available in Deno and modern Node.
  const std = btoa(bin);
  return std.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Tiny non-crypto fallback hash (only used if Web Crypto explodes). */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// ─── Outbound slot acquisition ───────────────────────────────────────────

export interface AcquireOutboundSlotInput {
  /** Result of `computeIdempotencyKey`. */
  idempotencyKey: string;
  /** Owner of the conversation. */
  customerId: string;
  /** Owner of the bot/instance. */
  consultantId: string;
  /** Stable hash of the actual payload (text/media/audio) for audit. */
  payloadHash: string;
}

export interface AcquireOutboundSlotResult {
  /**
   * `true` when this caller inserted the row and may proceed with the send.
   * `false` when the row already existed — caller MUST NOT send again and
   * should reuse the previous result, surfaced via the optional fields.
   */
  acquired: boolean;
  previousResultStatus?: string | null;
  previousMessageId?: string | null;
}

/**
 * Atomically reserves the outbound slot for this turn. Implementation:
 * `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING ...`,
 * expressed via `upsert(..., { ignoreDuplicates: true }).select(...)`.
 *
 * Conflict (returned array length 0) → existing row is fetched so the
 * caller can short-circuit with the prior `result_status` and
 * `evolution_message_id`. Any error here returns `acquired: true` (fail-
 * open) so a transient outage never silences the customer.
 */
export async function acquireOutboundSlot(
  supabase: SupabaseClient,
  input: AcquireOutboundSlotInput,
): Promise<AcquireOutboundSlotResult> {
  if (!input.idempotencyKey) {
    return { acquired: true };
  }

  try {
    const { data, error } = await supabase
      .from("outbound_message_log")
      .upsert(
        {
          idempotency_key: input.idempotencyKey,
          customer_id: input.customerId,
          consultant_id: input.consultantId,
          payload_hash: input.payloadHash,
        },
        { onConflict: "idempotency_key", ignoreDuplicates: true },
      )
      .select("result_status, evolution_message_id");

    if (error) {
      console.warn(
        `[idempotency] acquireOutboundSlot upsert error ${error.code} ${error.message}`,
      );
      return { acquired: true };
    }

    const inserted = Array.isArray(data) && data.length > 0;
    if (inserted) return { acquired: true };

    // Conflict path — fetch the prior row so the caller can replay the
    // previous outcome without re-sending.
    try {
      const { data: existing, error: selErr } = await supabase
        .from("outbound_message_log")
        .select("result_status, evolution_message_id")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();

      if (selErr) {
        console.warn(
          `[idempotency] acquireOutboundSlot select error ${selErr.code} ${selErr.message}`,
        );
        return { acquired: false };
      }
      return {
        acquired: false,
        previousResultStatus: (existing as any)?.result_status ?? null,
        previousMessageId: (existing as any)?.evolution_message_id ?? null,
      };
    } catch (e) {
      console.error("[idempotency] acquireOutboundSlot select threw", e);
      return { acquired: false };
    }
  } catch (e) {
    console.error("[idempotency] acquireOutboundSlot threw (fail-open)", e);
    return { acquired: true };
  }
}

/**
 * Records the actual outcome of the send so a future redelivery hitting the
 * same key can replay it. Designed to be called after `sendWithRetry`
 * finishes (or errors). Never throws.
 */
export async function recordOutboundResult(
  supabase: SupabaseClient,
  idempotencyKey: string,
  resultStatus: string,
  evolutionMessageId?: string | null,
): Promise<void> {
  if (!idempotencyKey) return;

  try {
    const { error } = await supabase
      .from("outbound_message_log")
      .update({
        result_status: resultStatus,
        evolution_message_id: evolutionMessageId ?? null,
      })
      .eq("idempotency_key", idempotencyKey);

    if (error) {
      console.warn(
        `[idempotency] recordOutboundResult error ${error.code} ${error.message}`,
      );
    }
  } catch (e) {
    console.error("[idempotency] recordOutboundResult threw", e);
  }
}
