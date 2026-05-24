// Filtro batch de "pode enviar?" para os crons — Semana 1 do rollout v3.
//
// Os crons já filtram via SQL pela forma legada (`bot_paused=false AND
// assigned_human_id IS NULL`). Este helper adiciona a checagem da v3
// (customer_flow_state.status) em UMA query para o batch inteiro, evitando
// N+1.
//
// Comportamento:
//   1. Faz UM SELECT em `customer_flow_state` para todos os customerIds.
//   2. Marca como `unsendable` quem está em `paused_*`, `converted`, `lost`
//      ou tem `pause_reason='opt_out'`.
//   3. Customers sem linha em customer_flow_state passam (forma legada já
//      filtrou — não há motivo para barrar duplamente).
//   4. Loga `cron_pause_disagreement` quando v3 barrar um customer que a
//      forma legada aprovou (útil para identificar inconsistência durante
//      a migração).
//
// Nunca lança — em erro, retorna a lista original (fail-open: cron segue).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonLog } from "./audit.ts";

const FORBIDDEN_STATUSES = new Set([
  "paused_manual",
  "paused_system",
  "converted",
  "lost",
]);

export async function filterSendableCustomers(
  supabase: SupabaseClient,
  customerIds: string[],
  options?: { cronName?: string },
): Promise<string[]> {
  if (!customerIds || customerIds.length === 0) return [];
  const cronName = options?.cronName ?? "unknown";

  try {
    const { data, error } = await supabase
      .from("customer_flow_state")
      .select("customer_id, status, pause_reason")
      .in("customer_id", customerIds);

    if (error || !data) {
      // Tabela pode não existir ainda em ambientes legados — fail-open.
      return customerIds;
    }

    const v3Map = new Map<string, { status: string; pauseReason: string | null }>();
    for (const row of data as any[]) {
      v3Map.set(String(row.customer_id), {
        status: String(row.status ?? ""),
        pauseReason: row.pause_reason ?? null,
      });
    }

    const sendable: string[] = [];
    for (const id of customerIds) {
      const v3 = v3Map.get(id);
      if (!v3) {
        // Sem linha → forma legada já aprovou. Passa.
        sendable.push(id);
        continue;
      }
      const forbidden = FORBIDDEN_STATUSES.has(v3.status) || v3.pauseReason === "opt_out";
      if (forbidden) {
        jsonLog("info", "cron_pause_disagreement", {
          cron: cronName,
          customer_id: id,
          v3_status: v3.status,
          v3_pause_reason: v3.pauseReason,
          decision: "blocked_by_v3",
        });
        continue;
      }
      sendable.push(id);
    }
    return sendable;
  } catch (e: any) {
    console.warn(`[cron-pause-batch:${cronName}] fail-open:`, e?.message);
    return customerIds;
  }
}
