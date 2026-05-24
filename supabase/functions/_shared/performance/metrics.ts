// Performance metrics wrapper (Phase E Task 29 do whatsapp-flow-architecture-v3).
//
// Centraliza inserts em `bot_step_transitions`. Toda transição de step
// passa por aqui. Substitui chamadas espalhadas no código.
//
// Nunca lança. Falha vira log `metrics_record_failed`.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonLog } from "../audit.ts";

export interface RecordStepTransitionInput {
  customerId: string;
  consultantId: string;
  flowId?: string | null;
  fromStep: string | null;
  toStep: string;
  durationMs?: number;
  reason?: string;
}

export async function recordStepTransition(
  supabase: SupabaseClient,
  input: RecordStepTransitionInput,
): Promise<void> {
  if (!input.customerId || !input.toStep) return;
  try {
    const row: Record<string, unknown> = {
      customer_id: input.customerId,
      consultant_id: input.consultantId,
      from_step: input.fromStep ?? null,
      to_step: input.toStep,
      reason: input.reason ?? null,
    };
    if (typeof input.durationMs === "number") {
      row.duration_ms = input.durationMs;
    }
    await supabase.from("bot_step_transitions").insert(row);
  } catch (e: any) {
    jsonLog("warn", "metrics_record_failed", {
      customer_id: input.customerId,
      consultant_id: input.consultantId,
      from_step: input.fromStep,
      to_step: input.toStep,
      message: e?.message ?? String(e),
    });
  }
}
