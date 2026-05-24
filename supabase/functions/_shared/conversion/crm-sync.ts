// CRM sync (Phase E Task 28 do whatsapp-flow-architecture-v3).
//
// Wrapper único sobre `crm-stage-sync.ts` + `syncDealStageFromStep`.
// Idempotente — chamadas repetidas com mesma entrada não duplicam deal.
// Roda no dispatcher após `persistFlowState` ou no webhook após o turno.
//
// Nunca lança. Falha vira log `crm_sync_failed`.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonLog } from "../audit.ts";

export interface SyncCustomerStageInput {
  customerId: string;
  stepKeyAfter: string;
  consultantId: string;
}

/**
 * Sincroniza `crm_deals.stage` a partir do `conversation_step` do customer.
 * Reusa `syncDealStageFromStep` legado (já testado em produção).
 */
export async function syncCustomerStage(
  supabase: SupabaseClient,
  input: SyncCustomerStageInput,
): Promise<void> {
  if (!input.customerId || !input.stepKeyAfter) return;
  try {
    const { syncDealStageFromStep } = await import("../crm-stage-sync.ts");
    await syncDealStageFromStep(supabase, input.customerId, input.stepKeyAfter);
  } catch (e: any) {
    jsonLog("warn", "crm_sync_failed", {
      customer_id: input.customerId,
      consultant_id: input.consultantId,
      step: input.stepKeyAfter,
      message: e?.message ?? String(e),
    });
  }
}
