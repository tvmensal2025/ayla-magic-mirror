// Webhook hook para o Flow Engine V3 (Semana 1 do rollout — Plano aprovado).
//
// Helper único usado por whapi-webhook (produção) e evolution-webhook (espelho)
// para integrar o engine v3 sem duplicar lógica. Mantém o caminho legado como
// fonte de verdade: em qualquer falha do v3, o legado segue emitindo.
//
// Comportamento por flag (`consultants.flow_engine_v3`):
//
//   'off'        → no-op. Retorna { handled: false } imediatamente.
//   'dark'       → loadFlowState + tick(). Loga `engine_dark_decision` com a
//                  ação planejada. NÃO emite. Legado emite normalmente.
//   'canary'/on  → loadFlowState + tick(). Se a ação for
//                  `delegate_legacy_runBotFlow`, retorna { handled: false }
//                  para o legado assumir. Para outras ações, loga
//                  `engine_v3_would_emit` e retorna { handled: false }
//                  enquanto o canal não estiver wired ao ChannelAdapter v3
//                  (acontece em Semana 4 após validação).
//
// FAIL-OPEN: qualquer throw → log `engine_v3_fallback_to_legacy` + retorna
// { handled: false }. O caminho legado nunca é bloqueado por bug do v3.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getFlowEngineV3, isV2Enabled, type FlowEngineV3Flag } from "../feature-flag.ts";
import { loadFlowState } from "../customer-flow-state.ts";
import { jsonLog } from "../audit.ts";

export interface RunEngineV3Input {
  supabase: SupabaseClient;
  customerId: string;
  consultantId: string;
  /** Útil em logs para auditoria de paridade dark vs legado. */
  legacyStep?: string | null;
  /** Útil em logs para auditoria. */
  inboundKind?: "text" | "button_click" | "media" | "timer_expired" | "no_input";
}

export interface RunEngineV3Result {
  /**
   * True quando o engine v3 assumiu o turno (não acontece nesta semana —
   * sempre false até o ChannelAdapter v3 estar wired no webhook ativo).
   * Caller deve seguir o caminho legado quando handled=false.
   */
  handled: false;
  /** Flag observada (para o caller logar / decidir métricas). */
  flag: FlowEngineV3Flag;
  /** True quando o engine indicou que o legado deve assumir (delegate_legacy_runBotFlow). */
  delegatedToLegacy: boolean;
}

const NOOP_RESULT = (flag: FlowEngineV3Flag): RunEngineV3Result => ({
  handled: false,
  flag,
  delegatedToLegacy: false,
});

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
      // Sem estado canônico ainda — engine v3 não tem o que decidir.
      // Esperado para leads que nunca passaram pela v2. Não é erro.
      return NOOP_RESULT(flag);
    }

    // Log mínimo de observabilidade. O `tick()` completo precisa do EngineStep
    // carregado (bot_flow_steps_canonical) — quando o webhook estiver wired
    // ao ChannelAdapter v3 (Semana 4), passamos a chamar `tick` aqui de fato.
    //
    // Por ora, só logar o snapshot do estado já é informação valiosa para
    // o painel `v_flow_engine_health` correlacionar com a decisão real do
    // legado e medir paridade.
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

    // `delegated_legacy` é o sinal explícito do engine v3 para "passa para o
    // legado". Em modo canary/on, ainda assim retornamos handled=false porque
    // o legado é quem emite — o engine só observa nesta fase.
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
