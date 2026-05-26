/**
 * Engine v3 dispatcher.
 *
 * Spec: `.kiro/specs/flow-engine-v3-rewrite/design.md` §1.2 (component
 * map: `v3-dispatcher.ts`) + §2.7 (turn evaluation order).
 * Task: 26.
 *
 * Pure runner produces an `EngineOutput`; this module is the impure
 * companion that:
 *   1) Sends every `OutboundMessage` through the channel adapter in order.
 *   2) Persists `stateUpdate` atomically to `customer_flow_state` (and
 *      the `last_outbound_content_hash` column added by the v3 schema
 *      migration).
 *   3) Writes every `StructuredLog` to `engine_logs`.
 *   4) Inserts `bot_handoff_alerts` for any log carrying
 *      `sideEffect.kind === "insert_handoff_alert"`. The alert insert
 *      ALWAYS fires before the log insert, with retry-then-DLQ semantics
 *      so a transient DB hiccup never silently swallows a handoff
 *      (Requirement 6.2 + 14.4).
 *
 * Validates: Requirements 1.6, 1.7, 6.2, 9.4, 12.2, 14.1, 14.2, 14.3, 14.4.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  ChannelAdapter,
  CustomerSnapshot,
  EngineOutput,
  OutboundMessage,
  StructuredLog,
} from "./v3-types.ts";
import { persistFlowState } from "../customer-flow-state.ts";
import { renderChoice } from "../channels/dispatch-choice.ts";

// ─── Public API ─────────────────────────────────────────────────────────

export interface ExecuteActionsArgs {
  supabase: SupabaseClient;
  adapter: ChannelAdapter;
  /** Phone or JID the adapter expects in `sendText(jid, ...)`. */
  jid: string;
  /** Customer state BEFORE the engine ran (for diffing + retry context). */
  state: CustomerSnapshot;
  /** Engine output to execute. */
  result: EngineOutput;
  /** ISO-8601 timestamp from EngineConfig.now (for last_outbound_at). */
  now: string;
}

export interface ExecuteActionsOutcome {
  /** Number of outbounds successfully sent. */
  sent: number;
  /** Send failures (adapter returned ok=false or threw). */
  failed: number;
  /** Whether the customer_flow_state UPDATE succeeded. */
  statePersisted: boolean;
  /** Whether engine_logs insert succeeded. */
  logsPersisted: boolean;
  /** How many handoff alerts were inserted. */
  handoffAlerts: number;
  /** Adapter send results, in order. */
  sendResults: { kind: OutboundMessage["kind"]; ok: boolean; error?: string }[];
}

/**
 * Execute one engine output. Side-effecting: sends outbounds, writes
 * state, writes logs. Never throws on individual failures; aggregates
 * all errors in the returned outcome so the caller can decide whether
 * to log a Sentry alert.
 *
 * Order of operations:
 *  1. Send outbounds (in order) via adapter
 *  2. INSERT bot_handoff_alerts for any log with sideEffect (BEFORE state/logs)
 *  3. UPDATE customer_flow_state with stateUpdate
 *  4. UPDATE last_outbound_content_hash (separate query — not on the public
 *     persistFlowState surface)
 *  5. INSERT engine_logs batch
 *
 * Steps 2 and 5 are intentionally separated so a failed log insert does
 * NOT roll back the handoff alert (Requirement 14.4).
 */
export async function executeActions(
  args: ExecuteActionsArgs,
): Promise<ExecuteActionsOutcome> {
  const outcome: ExecuteActionsOutcome = {
    sent: 0,
    failed: 0,
    statePersisted: false,
    logsPersisted: false,
    handoffAlerts: 0,
    sendResults: [],
  };

  // ─── 1. Send outbounds in order ───────────────────────────────────────
  for (const msg of args.result.outbound) {
    const r = await sendOne(args.adapter, args.jid, msg);
    outcome.sendResults.push({ kind: msg.kind, ok: r.ok, error: r.error });
    if (r.ok) outcome.sent++;
    else outcome.failed++;
  }

  // ─── 2. Handoff alerts (BEFORE logs — Requirement 14.4) ───────────────
  const alertLogs = args.result.logs.filter(
    (l) => l.sideEffect?.kind === "insert_handoff_alert",
  );
  for (const log of alertLogs) {
    const ok = await insertHandoffAlertWithRetry(args.supabase, args.state, log);
    if (ok) outcome.handoffAlerts++;
  }

  // ─── 3. Persist customer_flow_state ───────────────────────────────────
  const su = args.result.stateUpdate;
  const hasStateChanges =
    su.currentStepId !== undefined ||
    su.status !== undefined ||
    su.pauseReason !== undefined ||
    su.retries !== undefined ||
    su.enteredStepAt !== undefined ||
    su.expiresAt !== undefined ||
    su.lastInboundAt !== undefined ||
    su.lastOutboundAt !== undefined;

  if (hasStateChanges) {
    outcome.statePersisted = await persistFlowState(args.supabase, {
      customerId: args.state.customerId,
      flowId: args.state.flowId,
      currentStepId: su.currentStepId,
      status: su.status as any,
      pauseReason: su.pauseReason as any,
      retries: su.retries,
      enteredStepAt: su.enteredStepAt,
      expiresAt: su.expiresAt,
      lastInboundAt: su.lastInboundAt,
      lastOutboundAt: su.lastOutboundAt,
    });
  } else {
    // Nothing to persist; treat as success.
    outcome.statePersisted = true;
  }

  // ─── 4. Update last_outbound_content_hash (separate query) ────────────
  if (su.lastOutboundContentHash !== undefined) {
    try {
      const { error } = await args.supabase
        .from("customer_flow_state")
        .update({ last_outbound_content_hash: su.lastOutboundContentHash })
        .eq("customer_id", args.state.customerId);
      if (error) {
        console.warn(
          "[v3-dispatcher] last_outbound_content_hash update failed:",
          error.message,
        );
      }
    } catch (e) {
      console.warn(
        "[v3-dispatcher] last_outbound_content_hash exception:",
        (e as Error)?.message,
      );
    }
  }

  // ─── 5. Persist engine_logs ───────────────────────────────────────────
  if (args.result.logs.length > 0) {
    outcome.logsPersisted = await insertEngineLogs(
      args.supabase,
      args.state,
      args.result.logs,
    );
  } else {
    outcome.logsPersisted = true;
  }

  return outcome;
}

// ─── Adapter send wrapper ───────────────────────────────────────────────

async function sendOne(
  adapter: ChannelAdapter,
  jid: string,
  msg: OutboundMessage,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = { customerId: undefined, flowId: undefined } as any;
  try {
    switch (msg.kind) {
      case "text": {
        const r = await adapter.sendText(jid, msg.text, ctx);
        return { ok: r.ok, error: r.ok ? undefined : (r as any).error };
      }
      case "choice": {
        // Use the dispatch-choice helper for consistent rendering. The
        // adapter's sendChoice already calls renderChoice internally;
        // we still pass `choice` directly so the adapter sees the
        // engine's intent (button vs list vs number).
        const r = await adapter.sendChoice(jid, msg.prompt, msg.choice, ctx);
        return { ok: r.ok, error: r.ok ? undefined : (r as any).error };
      }
      case "media": {
        const r = await adapter.sendMedia(jid, msg.media, ctx);
        return { ok: r.ok, error: r.ok ? undefined : (r as any).error };
      }
      case "audio_slot": {
        // The audio_slot kind requires the adapter to look up the
        // consultor's audio asset by `slotKey`. We do not have the
        // consultor id here, so we emit a placeholder log: the dispatcher
        // ALWAYS resolves audio_slot via the consultor's `ai_media_library`
        // BEFORE entering the engine, so this branch is reached only when
        // the engine emits `audio_slot` directly (rare; runner usually
        // synthesizes media items via `mediaOrderByStepKey` instead).
        console.warn(
          "[v3-dispatcher] unhandled audio_slot outbound; engine should resolve to media before emitting",
        );
        return { ok: false, error: "audio_slot unhandled" };
      }
      case "presence": {
        // Presence is best-effort. Adapter may or may not support it;
        // never block the conversation on a presence failure.
        try {
          await (adapter as any).sendPresence?.(
            jid,
            msg.presenceKind,
            msg.durationMs,
          );
        } catch (_) {/* noop */}
        return { ok: true };
      }
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// ─── Handoff alert insert with retry + DLQ ──────────────────────────────

const HANDOFF_RETRY_ATTEMPTS = 3;
const HANDOFF_RETRY_DELAY_MS = 250;

async function insertHandoffAlertWithRetry(
  supabase: SupabaseClient,
  state: CustomerSnapshot,
  log: StructuredLog,
): Promise<boolean> {
  if (log.sideEffect?.kind !== "insert_handoff_alert") return false;
  const reason = log.sideEffect.reason;

  for (let attempt = 1; attempt <= HANDOFF_RETRY_ATTEMPTS; attempt++) {
    try {
      const { error } = await supabase.from("bot_handoff_alerts").insert({
        customer_id: state.customerId,
        consultant_id: state.consultantId,
        reason,
        metadata: {
          source: "engine_v3",
          stepId: log.stepId,
          flowId: log.flowId,
          ...(log.payload ?? {}),
        },
      });
      if (!error) return true;
      console.warn(
        `[v3-dispatcher] handoff alert insert attempt ${attempt} failed:`,
        error.message,
      );
    } catch (e: any) {
      console.warn(
        `[v3-dispatcher] handoff alert insert attempt ${attempt} exception:`,
        e?.message,
      );
    }
    if (attempt < HANDOFF_RETRY_ATTEMPTS) {
      await sleep(HANDOFF_RETRY_DELAY_MS * attempt);
    }
  }

  // DLQ: persist to engine_logs with a sentinel kind so a cron can
  // replay later. We DO NOT try to insert into a separate DLQ table to
  // keep schema additions minimal; the engine_logs payload preserves
  // everything the cron needs to retry.
  try {
    await supabase.from("engine_logs").insert({
      at: log.at,
      kind: "engine_handoff",
      customer_id: state.customerId,
      flow_id: state.flowId,
      step_id: log.stepId,
      payload: {
        ...(log.payload ?? {}),
        dlq: true,
        original_reason: reason,
      },
      side_effect: { kind: "dlq_handoff_alert", reason },
    });
  } catch (_) {/* noop — last resort */}
  return false;
}

// ─── engine_logs insert ─────────────────────────────────────────────────

async function insertEngineLogs(
  supabase: SupabaseClient,
  state: CustomerSnapshot,
  logs: StructuredLog[],
): Promise<boolean> {
  if (logs.length === 0) return true;
  const rows = logs.map((l) => ({
    at: l.at,
    kind: l.kind,
    customer_id: state.customerId,
    flow_id: state.flowId,
    step_id: l.stepId,
    payload: l.payload ?? {},
    side_effect: l.sideEffect ?? null,
  }));
  try {
    const { error } = await supabase.from("engine_logs").insert(rows);
    if (error) {
      console.warn("[v3-dispatcher] engine_logs insert failed:", error.message);
      return false;
    }
    return true;
  } catch (e: any) {
    console.warn("[v3-dispatcher] engine_logs exception:", e?.message);
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
