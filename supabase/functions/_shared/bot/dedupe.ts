// Sprint 2.6 — extracted from {whapi,evolution}-webhook/handlers/conversational/index.ts
// Whapi/Evolution às vezes reenviam o mesmo webhook. Sem dedupe, capturas
// são processadas 2x e o auto-advance pula passos.
//
// Tabela canônica: `webhook_message_dedup` (unificada — antes existia o
// espelho órfão `webhook_message_dedupe` com "e", removido em 2026-05-19).
// TTL de 24h via pg_cron.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export interface DedupeResult {
  duplicate: boolean;
  /** Razão para log/debug: "hit" (linha existia via ON CONFLICT DO NOTHING), null. */
  reason: "hit" | null;
}

/**
 * Tenta inserir o `messageId` na tabela de dedupe. Se já existir, devolve
 * `{ duplicate: true }`. Em qualquer erro inesperado, devolve `{ duplicate: false }`
 * (fail-open) para não derrubar o fluxo do bot por causa de hiccup transitório.
 *
 * Usa upsert + ignoreDuplicates para evitar exceções 23505 que poluíam o
 * Postgres log a cada retry do Whapi.
 */
export async function checkAndMarkWebhookDedupe(
  supabase: SupabaseClient,
  messageId: string | null | undefined,
  _consultantId: string | null | undefined,
): Promise<DedupeResult> {
  if (!messageId) return { duplicate: false, reason: null };

  try {
    const { data, error } = await supabase
      .from("webhook_message_dedup")
      .upsert(
        { message_id: messageId, instance_name: "whapi" },
        { onConflict: "message_id", ignoreDuplicates: true },
      )
      .select("message_id");

    if (error) {
      console.warn(`[bot/dedupe] erro upsert: ${error.code} ${error.message}`);
      return { duplicate: false, reason: null }; // fail-open
    }
    const isDup = Array.isArray(data) && data.length === 0;
    if (isDup) console.log(`[bot/dedupe] 🔁 hit: ${messageId} já processado`);
    return { duplicate: isDup, reason: isDup ? "hit" : null };
  } catch (e) {
    console.error("[bot/dedupe] check failed (continuando, fail-open)", e);
    return { duplicate: false, reason: null };
  }
}

