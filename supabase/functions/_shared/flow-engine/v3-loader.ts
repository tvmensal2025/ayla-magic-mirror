/**
 * Engine v3 context loader.
 *
 * Spec: `.kiro/specs/flow-engine-v3-rewrite/design.md` §1.2 (component
 * map: `v3-loader.ts`) and §2.1 (CustomerSnapshot / BotFlow shape).
 * Task: 25.
 *
 * Single round-trip from Supabase: reads `customer_flow_state` joined
 * with `customers`, the consultor's active flow + steps, and resolves
 * `mediaOrderByStepKey` from `consultants.flow_step_media_order`.
 *
 * This module is impure (touches the DB). The engine never imports it —
 * the router does, and passes the loaded context into `runEngine`.
 *
 * Validates: Requirements 1.6, 1.7, 11.1, 11.5, 12.1, 16.1.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  BotFlow,
  BotFlowStep,
  CaptureSpec,
  ChannelCapabilities,
  CustomerSnapshot,
  FallbackSpec,
  MediaOrderEntry,
  TransitionSpec,
} from "./v3-types.ts";

export interface LoadedContext {
  state: CustomerSnapshot;
  flow: BotFlow;
  capabilities: ChannelCapabilities;
}

export interface LoadContextArgs {
  supabase: SupabaseClient;
  customerId: string;
  /** Channel adapter capabilities — passed in by the webhook entry. */
  capabilities: ChannelCapabilities;
}

/**
 * Loads the full context the engine needs for one tick. Throws when:
 *   - the customer does not exist
 *   - the customer's consultor has no active flow for the customer's variant
 *
 * The router is expected to catch and route to a 500 / fallback handler.
 */
export async function loadContext(args: LoadContextArgs): Promise<LoadedContext> {
  const { supabase, customerId, capabilities } = args;

  // ─── 1. Read customer + flow_state ─────────────────────────────────────
  const { data: customer, error: cErr } = await supabase
    .from("customers")
    .select(`
      id, consultant_id, flow_variant, name, electricity_bill_value,
      document_uploaded, otp_validated_at, phone_whatsapp,
      bot_paused, bot_paused_reason, conversation_step,
      customer_flow_state (
        current_step_id, status, pause_reason, retries,
        entered_step_at, expires_at, last_inbound_at,
        last_outbound_at, last_outbound_content_hash, flow_id, updated_at
      )
    `)
    .eq("id", customerId)
    .maybeSingle();

  if (cErr || !customer) {
    throw new Error(`v3-loader: customer ${customerId} not found: ${cErr?.message ?? "no row"}`);
  }

  const consultantId = customer.consultant_id as string;
  const variant = ((customer.flow_variant as string) || "A").toUpperCase() as "A" | "B" | "C" | "D";

  // ─── 2. Read active flow for variant ──────────────────────────────────
  const { data: flowRow } = await supabase
    .from("bot_flows")
    .select("id, strict_mode, variant")
    .eq("consultant_id", consultantId)
    .eq("variant", variant)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!flowRow) {
    throw new Error(`v3-loader: no active flow for consultant=${consultantId} variant=${variant}`);
  }

  // ─── 3. Read steps ─────────────────────────────────────────────────────
  const { data: stepRows } = await supabase
    .from("bot_flow_steps")
    .select("*")
    .eq("flow_id", flowRow.id)
    .eq("is_active", true)
    .order("position", { ascending: true });

  const stepsRaw = (stepRows as any[]) || [];
  const stepIds = stepsRaw.map((s) => s.id as string);

  // ─── 4. Read consultor's flow_step_media_order ────────────────────────
  const { data: consultantRow } = await supabase
    .from("consultants")
    .select("flow_step_media_order")
    .eq("id", consultantId)
    .maybeSingle();

  const mediaOrderJson = (consultantRow?.flow_step_media_order as Record<string, unknown>) || {};

  const mediaOrderByStepKey: Record<string, MediaOrderEntry[]> = {};
  for (const [key, entries] of Object.entries(mediaOrderJson)) {
    if (Array.isArray(entries)) {
      mediaOrderByStepKey[key] = normalizeMediaOrder(entries);
    }
  }

  // ─── 5. Materialize BotFlowStep[] ──────────────────────────────────────
  const steps: BotFlowStep[] = stepsRaw.map((s) => ({
    id: s.id,
    flowId: s.flow_id,
    stepKey: s.step_key ?? null,
    stepType: s.step_type,
    position: Number(s.position) || 0,
    messageText: s.message_text ?? null,
    persuasiveText: s.persuasive_text ?? null,
    choiceOptions: extractChoiceOptions(s.captures),
    preferredChoiceKind: s.preferred_choice_kind ?? null,
    captures: parseCaptures(s.captures),
    transitions: parseTransitions(s.transitions),
    fallback: parseFallback(s.fallback),
    waitFor: (s.wait_for as BotFlowStep["waitFor"]) ?? "none",
    waitSeconds: Number(s.wait_seconds) || 0,
    pipelineKind: pipelineKindFor(s.step_type),
    slotKey: s.slot_key ?? null,
    conditionExpr: s.condition_text ? { _raw: s.condition_text } : null,
    reachableStepIds: stepIds, // closed set — every step can transition to any other
  }));

  const flow: BotFlow = {
    id: flowRow.id as string,
    consultantId,
    variant,
    strictMode: !!(flowRow as any).strict_mode,
    steps,
    mediaOrderByStepKey,
  };

  // ─── 6. Materialize CustomerSnapshot ──────────────────────────────────
  const cfs = (customer.customer_flow_state as any) || {};
  const state: CustomerSnapshot = {
    customerId: customer.id as string,
    consultantId,
    flowId: flow.id,
    currentStepId: cfs.current_step_id ?? null,
    status: (cfs.status as CustomerSnapshot["status"]) ?? "new",
    pauseReason: cfs.pause_reason ?? null,
    retries: Number(cfs.retries) || 0,
    enteredStepAt: cfs.entered_step_at ?? new Date(0).toISOString(),
    expiresAt: cfs.expires_at ?? null,
    lastInboundAt: cfs.last_inbound_at ?? null,
    lastOutboundAt: cfs.last_outbound_at ?? null,
    lastOutboundContentHash: cfs.last_outbound_content_hash ?? null,
    customer: {
      name: customer.name ?? null,
      electricityBillValue: customer.electricity_bill_value ?? null,
      documentUploaded: !!customer.document_uploaded,
      otpValidatedAt: customer.otp_validated_at ?? null,
      phoneWhatsapp: customer.phone_whatsapp ?? null,
    },
  };

  return { state, flow, capabilities };
}

// ─── Parsers (defensive — shape of stored JSONB varies historically) ───

function parseCaptures(raw: unknown): CaptureSpec[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => c !== null && typeof c === "object")
    .filter((c) => c.field !== "_buttons") // _buttons is the choice-options carve-out, not a real capture
    .map((c) => ({
      field: String(c.field ?? ""),
      enabled: c.enabled !== false,
      validator: (c.validator as CaptureSpec["validator"]) ?? undefined,
      required: c.required === true ? true : undefined,
    }));
}

function extractChoiceOptions(raw: unknown): BotFlowStep["choiceOptions"] {
  if (!Array.isArray(raw)) return null;
  for (const c of raw) {
    if (c && typeof c === "object" && (c as any).field === "_buttons") {
      const value = (c as any).value;
      if (Array.isArray(value)) {
        return value
          .filter((v): v is Record<string, unknown> => v !== null && typeof v === "object")
          .map((v) => ({
            id: String(v.id ?? ""),
            title: String(v.title ?? v.id ?? ""),
            description: typeof v.description === "string" ? v.description : undefined,
          }));
      }
    }
  }
  return null;
}

function parseTransitions(raw: unknown): TransitionSpec[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Record<string, unknown> => t !== null && typeof t === "object")
    .map((t) => ({
      trigger_intent: typeof t.trigger_intent === "string" ? t.trigger_intent : null,
      trigger_phrases: Array.isArray(t.trigger_phrases) ? t.trigger_phrases as string[] : null,
      goto_step_id: typeof t.goto_step_id === "string" ? t.goto_step_id : null,
      goto_special: (t.goto_special as TransitionSpec["goto_special"]) ?? null,
    }));
}

function parseFallback(raw: unknown): FallbackSpec {
  if (!raw || typeof raw !== "object") return { mode: "repeat" };
  const r = raw as Record<string, unknown>;
  const mode = (r.mode as FallbackSpec["mode"]) ?? "repeat";
  return {
    mode,
    goto_step_id: typeof r.goto_step_id === "string" ? r.goto_step_id : null,
    ai_prompt: typeof r.ai_prompt === "string" ? r.ai_prompt : undefined,
    max_questions: typeof r.max_questions === "number" ? r.max_questions : undefined,
    max_retries: typeof r.max_retries === "number" ? r.max_retries : undefined,
    on_fail: r.on_fail as FallbackSpec["on_fail"] ?? undefined,
    handoff_reason: typeof r.handoff_reason === "string" ? r.handoff_reason : undefined,
    then: r.then as FallbackSpec["then"] ?? undefined,
  };
}

function pipelineKindFor(stepType: string): BotFlowStep["pipelineKind"] {
  if (stepType === "capture_conta") return "ocr_conta";
  if (stepType === "capture_documento") return "ocr_documento";
  if (stepType === "finalizar_cadastro") return "finalizar_cadastro";
  if (stepType === "cadastro") return "cadastro_portal";
  return null;
}


/**
 * Normalize `flow_step_media_order` entries to canonical `MediaOrderEntry`
 * shape. Historically the column stores either rich objects
 * (`{kind: "audio", media_id: "..."}`) or bare strings
 * (`["audio","image","video","text"]`) declaring only the ordering.
 *
 * Variant A's `renderMediaItem` and Variant D's overlay both expect
 * `item.kind` — passing raw strings crashes with "Cannot read properties
 * of undefined (reading 'kind')". We coerce strings to
 * `{kind: "<string>", text: undefined, media_id: undefined}` so the
 * variant builders can decide whether to skip (no media_id) or render.
 *
 * Validates: Requirements 5.1, 5.5 (media ordering across variants).
 */
function normalizeMediaOrder(entries: unknown[]): MediaOrderEntry[] {
  const out: MediaOrderEntry[] = [];
  for (const e of entries) {
    if (e === null || e === undefined) continue;
    if (typeof e === "string") {
      // Bare string — interpret as kind hint only. media_id absent
      // means the variant builder MUST fall back to synthesis from
      // step.messageText (the renderer treats this as "skip").
      out.push({ kind: e as MediaOrderEntry["kind"] });
      continue;
    }
    if (typeof e === "object") {
      const o = e as Record<string, unknown>;
      const kind = typeof o.kind === "string" ? o.kind : undefined;
      if (!kind) continue;
      out.push({
        kind: kind as MediaOrderEntry["kind"],
        text: typeof o.text === "string" ? o.text : undefined,
        media_id: typeof o.media_id === "string" ? o.media_id : undefined,
      } as MediaOrderEntry);
    }
  }
  return out;
}
