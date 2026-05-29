// Webhook hook para o Flow Engine V3 — modo dark com paridade real.
//
// Antes (Semana 1-2): só logava snapshot do estado. Não detectava divergência
// de **output** entre legado e V3 — você promovia no escuro.
//
// Agora (C2 do plano de robustez): em modo dark/canary, executa
// `loadContext + runEngine` de fato e loga o `EngineOutput` (texto/áudio/
// botões que o V3 *teria* enviado) em `engine_logs` com kind
// `engine_dark_output`. O dispatcher NÃO roda — legado segue como fonte de
// verdade no envio. Daí dá pra rodar diff offline contra `conversations`
// para medir paridade.
//
// FAIL-OPEN: qualquer throw → log `engine_v3_fallback_to_legacy` + retorna
// { handled: false }. Legado nunca é bloqueado por bug do V3.

import { getFlowEngineV3, isV2Enabled, type FlowEngineV3Flag } from "../feature-flag.ts";
import { loadFlowState } from "../customer-flow-state.ts";
import { jsonLog } from "../audit.ts";

// deno-lint-ignore no-explicit-any
type AnySupabase = any;

export interface RunEngineV3Input {
  supabase: AnySupabase;
  customerId: string;
  consultantId: string;
  legacyStep?: string | null;
  inboundKind?: "text" | "button_click" | "media" | "timer_expired" | "no_input";
  /** Texto/botão do inbound atual — usado para construir o InboundEvent do V3. */
  inboundText?: string | null;
  inboundButtonId?: string | null;
  inboundMediaKind?: "image" | "audio" | "video" | "document" | null;
  inboundMessageId?: string | null;
}

export interface RunEngineV3Result {
  handled: false;
  flag: FlowEngineV3Flag;
  delegatedToLegacy: boolean;
}

const NOOP_RESULT = (flag: FlowEngineV3Flag): RunEngineV3Result => ({
  handled: false,
  flag,
  delegatedToLegacy: false,
});

/**
 * Reduz `EngineOutput.outbound` para um shape pequeno serializável
 * (texto + tipo + tamanho), suficiente para diff de paridade sem
 * inchar `engine_logs`.
 */
function summarizeOutbound(outbound: any[]): Array<Record<string, unknown>> {
  if (!Array.isArray(outbound)) return [];
  return outbound.slice(0, 8).map((m) => {
    if (m?.kind === "text") {
      return { kind: "text", len: String(m.text ?? "").length, head: String(m.text ?? "").slice(0, 80) };
    }
    if (m?.kind === "choice") {
      return {
        kind: "choice",
        prompt_len: String(m.prompt ?? "").length,
        options: (m.choice?.options ?? []).map((o: any) => String(o.title ?? "").slice(0, 40)),
      };
    }
    if (m?.kind === "media") {
      return { kind: "media", media_kind: m.media?.kind, has_caption: !!m.media?.caption };
    }
    if (m?.kind === "audio_slot") {
      return { kind: "audio_slot", slot: m.slotKey ?? null };
    }
    if (m?.kind === "presence") {
      return { kind: "presence", presence: m.presenceKind };
    }
    return { kind: String(m?.kind ?? "unknown") };
  });
}

export async function runEngineV3IfEnabled(
  input: RunEngineV3Input,
): Promise<RunEngineV3Result> {
  const { supabase, customerId, consultantId } = input;
  let flag: FlowEngineV3Flag = "off";

  try {
    flag = await getFlowEngineV3(supabase, consultantId);
    if (!isV2Enabled(flag)) {
      return NOOP_RESULT(flag);
    }

    const state = await loadFlowState(supabase, customerId);
    if (!state || !state.currentStepId) {
      // Sem estado canônico — engine V3 ainda não tem o que decidir.
      return NOOP_RESULT(flag);
    }

    // ─── Dark/canary parity: rodar runEngine de fato ─────────────────────
    // Importação dinâmica evita ciclo (engine importa tipos de DB) e mantém
    // o cold-start mais leve quando flag='off'.
    let outboundSummary: Array<Record<string, unknown>> = [];
    let logsCount = 0;
    let stateUpdate: Record<string, unknown> = {};
    let engineError: string | null = null;

    try {
      const [{ loadContext }, { runEngine }, channels] = await Promise.all([
        import("./loader.ts"),
        import("./runner.ts"),
        import("../channels/index.ts"),
      ]);

      // Capabilities mínimas — em modo dark não enviamos nada, mas o engine
      // precisa saber o que o canal suportaria.
      const adapter = (channels as any).getAdapter?.({
        kind: "whapi",
        input: { apiToken: "dark-no-send" },
      });
      const capabilities = adapter?.capabilities ?? {
        supportsButtons: true,
        supportsList: true,
        supportsAudio: true,
        supportsVideo: true,
        supportsDocument: true,
      };

      const ctx = await loadContext({ supabase, customerId, capabilities });

      // Reconstruir InboundEvent a partir do inbound bruto do webhook.
      const txt = (input.inboundText ?? "").trim();
      const inboundEvent =
        input.inboundButtonId
          ? { kind: "button_click" as const, buttonId: String(input.inboundButtonId), rawText: input.inboundText || undefined }
          : input.inboundMediaKind
          ? { kind: "media" as const, mediaKind: input.inboundMediaKind, mediaRef: String(input.inboundMessageId ?? "") }
          : txt && /^\d{1,2}$/.test(txt)
          ? { kind: "number_reply" as const, raw: txt }
          : txt
          ? { kind: "text" as const, text: input.inboundText ?? "" }
          : { kind: "no_input" as const };

      const nowMs = Date.now();
      const config = {
        now: new Date(nowMs).toISOString(),
        minuteBucket: Math.floor(nowMs / 60_000),
        isDarkMode: true,
        allowedDomains: ["igreen.energy"],
        idempotencyKeyFn: (parts: any) => `${parts.stepId}:${parts.content}:${parts.minuteBucket}`,
        humanDelayFn: (charLen: number) => Math.min(12_000, Math.max(2_000, charLen * 60)),
        limits: { maxOutboundsPerTurn: 6, maxRetriesBeforeHandoff: 3, maxAiQuestionsPerStep: 3 },
      };

      const hooksMod = await import("./hooks.ts");
      const hooks = (hooksMod as any).defaultHooks();

      const result = (runEngine as any)({
        state: ctx.state,
        inbound: inboundEvent,
        flow: ctx.flow,
        capabilities: ctx.capabilities,
        hooks,
        config,
      });

      outboundSummary = summarizeOutbound(result?.outbound ?? []);
      logsCount = Array.isArray(result?.logs) ? result.logs.length : 0;
      stateUpdate = result?.stateUpdate ?? {};
    } catch (e: any) {
      engineError = e?.message ?? String(e);
    }

    // Snapshot de estado (mantém compat com painel atual).
    jsonLog(flag === "dark" ? "info" : "info", "engine_dark_decision", {
      customer_id: customerId,
      consultant_id: consultantId,
      flag,
      v3_status: state.status,
      v3_current_step_id: state.currentStepId,
      v3_pause_reason: state.pauseReason,
      v3_retries: state.retries,
      legacy_step: input.legacyStep ?? null,
      inbound_kind: input.inboundKind ?? null,
    });

    // Log de paridade de OUTPUT — chave nova consumida pela view.
    try {
      await supabase.from("engine_logs").insert({
        at: new Date().toISOString(),
        kind: "engine_dark_output",
        customer_id: customerId,
        flow_id: null,
        step_id: state.currentStepId ?? null,
        payload: {
          flag,
          legacy_step: input.legacyStep ?? null,
          inbound_kind: input.inboundKind ?? null,
          v3_outbound: outboundSummary,
          v3_logs_count: logsCount,
          v3_state_update: stateUpdate,
          engine_error: engineError,
        },
      });
    } catch (_) { /* best-effort */ }

    const delegated = state.status === "delegated_legacy";
    return { handled: false, flag, delegatedToLegacy: delegated };
  } catch (e: any) {
    jsonLog("warn", "engine_v3_fallback_to_legacy", {
      customer_id: customerId,
      consultant_id: consultantId,
      flag,
      error: e?.message ?? String(e),
    });
    return NOOP_RESULT(flag);
  }
}
