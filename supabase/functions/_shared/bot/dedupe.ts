// Sprint 2.6 — extracted from {whapi,evolution}-webhook/handlers/conversational/index.ts
// Whapi/Evolution às vezes reenviam o mesmo webhook. Sem dedupe, capturas
// são processadas 2x e o auto-advance pula passos.
//
// Tabela `webhook_message_dedupe` tem TTL de 24h via pg_cron.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export interface DedupeResult {
  duplicate: boolean;
  /** Razão para log/debug: "hit" (linha existia), "conflict" (PK 23505), null. */
  reason: "hit" | "conflict" | null;
}

/**
 * Tenta inserir o `messageId` na tabela de dedupe. Se já existir, devolve
 * `{ duplicate: true }`. Em qualquer erro inesperado, devolve `{ duplicate: false }`
 * (fail-open) para não derrubar o fluxo do bot por causa de hiccup transitório.
 */
export async function checkAndMarkWebhookDedupe(
  supabase: SupabaseClient,
  messageId: string | null | undefined,
  consultantId: string | null | undefined,
): Promise<DedupeResult> {
  if (!messageId) return { duplicate: false, reason: null };

  try {
    const { data: inserted, error: dupErr } = await supabase
      .from("webhook_message_dedupe")
      .insert({ message_id: messageId, consultant_id: consultantId || null })
      .select("message_id")
      .maybeSingle();

    if (!inserted && !dupErr) {
      console.log(`[bot/dedupe] 🔁 hit: ${messageId} já processado`);
      return { duplicate: true, reason: "hit" };
    }
    if (dupErr && String((dupErr as any).code) === "23505") {
      console.log(`[bot/dedupe] 🔁 conflict: ${messageId}`);
      return { duplicate: true, reason: "conflict" };
    }
    return { duplicate: false, reason: null };
  } catch (e) {
    console.error("[bot/dedupe] check failed (continuando, fail-open)", e);
    return { duplicate: false, reason: null };
  }
}
