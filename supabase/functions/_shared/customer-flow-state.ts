// Helpers de leitura/escrita de `customer_flow_state` (Phase B Task 13 do
// whatsapp-flow-architecture-v3).
//
// Encapsula:
//   - `loadFlowState(customerId)`: lê a linha + faz SELECT de campos do
//     `customers` que o engine precisa em `EngineCustomerState.customer`.
//   - `persistFlowState(state)`: UPDATE atômico (uma única chamada). O
//     trigger `sync_customer_flow_state_to_customers` espelha em `customers`.
//
// Nunca lança. Em erro, retorna null e loga via console.warn — o caller
// trata como "não há estado" (engine v3 vira no-op naquele turno).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type CustomerFlowStatus =
  | "new" | "running" | "waiting_reply" | "waiting_media" | "waiting_timer"
  | "paused_manual" | "paused_system" | "converted" | "lost" | "delegated_legacy";

export type CustomerPauseReason =
  | "opt_out" | "humano_assumiu" | "lead_pediu_humano" | "low_bill_value"
  | "low_confidence_handoff" | "lead_refused_softpause" | "lead_nao_pronto"
  | "lead_quer_pensar" | "lead_nao_responde" | "confused_after_retries"
  | "muitas_duvidas" | "muitas_duvidas_ia" | "ai_handoff_duvidas"
  | "ai_limit_atingido" | "anti_loop" | "silent_handoff_empty_reply"
  | "gemini_quota_exhausted" | "dados_incompletos_pos_loop"
  | "custom_step_no_match_retries_exhausted" | "ia_decidiu" | "engine_error";

/** Snapshot canônico do estado do lead consumido pelo engine. */
export interface EngineCustomerState {
  customerId: string;
  flowId: string;
  currentStepId: string | null;
  status: CustomerFlowStatus;
  pauseReason: CustomerPauseReason | null;
  retries: number;
  enteredStepAt: string;
  expiresAt: string | null;
  assignedHumanId: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  /** Subset mínimo de `customers.*` que guards/preconditions usam. */
  customer: {
    name: string | null;
    electricityBillValue: number | null;
    documentUploaded: boolean;
    otpValidatedAt: string | null;
    consultantId: string | null;
    phoneWhatsapp: string | null;
  };
}

export async function loadFlowState(
  supabase: SupabaseClient,
  customerId: string,
): Promise<EngineCustomerState | null> {
  if (!customerId) return null;
  try {
    // Single round-trip: select com join leve em customers para o snapshot.
    const { data, error } = await supabase
      .from("customer_flow_state")
      .select(`
        customer_id,
        flow_id,
        current_step_id,
        status,
        pause_reason,
        retries,
        entered_step_at,
        expires_at,
        assigned_human_id,
        last_inbound_at,
        last_outbound_at,
        customers:customer_id (
          name,
          electricity_bill_value,
          document_uploaded,
          otp_validated_at,
          consultant_id,
          phone_whatsapp
        )
      `)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (error) {
      console.warn("[customer-flow-state] loadFlowState erro:", error.message);
      return null;
    }
    if (!data) return null;

    const c = (data as any).customers ?? {};
    return {
      customerId: String((data as any).customer_id),
      flowId: String((data as any).flow_id),
      currentStepId: (data as any).current_step_id ?? null,
      status: (data as any).status as CustomerFlowStatus,
      pauseReason: ((data as any).pause_reason as CustomerPauseReason | null) ?? null,
      retries: Number((data as any).retries ?? 0),
      enteredStepAt: String((data as any).entered_step_at),
      expiresAt: (data as any).expires_at ?? null,
      assignedHumanId: (data as any).assigned_human_id ?? null,
      lastInboundAt: (data as any).last_inbound_at ?? null,
      lastOutboundAt: (data as any).last_outbound_at ?? null,
      customer: {
        name: c.name ?? null,
        electricityBillValue: c.electricity_bill_value ?? null,
        documentUploaded: !!c.document_uploaded,
        otpValidatedAt: c.otp_validated_at ?? null,
        consultantId: c.consultant_id ?? null,
        phoneWhatsapp: c.phone_whatsapp ?? null,
      },
    };
  } catch (e: any) {
    console.error("[customer-flow-state] loadFlowState exception:", e?.message);
    return null;
  }
}

export interface PersistFlowStateInput {
  customerId: string;
  flowId?: string;
  currentStepId?: string | null;
  status?: CustomerFlowStatus;
  pauseReason?: CustomerPauseReason | null;
  pauseMeta?: Record<string, unknown>;
  retries?: number;
  enteredStepAt?: string;
  expiresAt?: string | null;
  assignedHumanId?: string | null;
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
}

/**
 * UPDATE atômico em `customer_flow_state`. Retorna `true` em sucesso.
 * Cria a linha caso não exista (UPSERT) — útil para customers novos.
 *
 * O trigger `sync_customer_flow_state_to_customers` espelha mudanças
 * relevantes para `customers.*` (bot_paused, pause_reason, assigned_human_id).
 *
 * Nunca lança.
 */
export async function persistFlowState(
  supabase: SupabaseClient,
  input: PersistFlowStateInput,
): Promise<boolean> {
  if (!input.customerId) return false;
  try {
    const patch: Record<string, unknown> = {};
    if (input.flowId !== undefined) patch.flow_id = input.flowId;
    if (input.currentStepId !== undefined) patch.current_step_id = input.currentStepId;
    if (input.status !== undefined) patch.status = input.status;
    if (input.pauseReason !== undefined) patch.pause_reason = input.pauseReason;
    if (input.pauseMeta !== undefined) patch.pause_meta = input.pauseMeta;
    if (input.retries !== undefined) patch.retries = input.retries;
    if (input.enteredStepAt !== undefined) patch.entered_step_at = input.enteredStepAt;
    if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt;
    if (input.assignedHumanId !== undefined) patch.assigned_human_id = input.assignedHumanId;
    if (input.lastInboundAt !== undefined) patch.last_inbound_at = input.lastInboundAt;
    if (input.lastOutboundAt !== undefined) patch.last_outbound_at = input.lastOutboundAt;

    // UPSERT: precisa de `flow_id` mínimo para a linha nova passar nas FKs.
    // Caller sempre passa `flowId` no primeiro persist; UPDATEs subsequentes
    // omitem.
    const { error } = await supabase
      .from("customer_flow_state")
      .upsert(
        { customer_id: input.customerId, ...patch },
        { onConflict: "customer_id" },
      );

    if (error) {
      console.warn("[customer-flow-state] persistFlowState erro:", error.message);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error("[customer-flow-state] persistFlowState exception:", e?.message);
    return false;
  }
}
