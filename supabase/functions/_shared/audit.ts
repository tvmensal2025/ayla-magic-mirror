// Helpers compartilhados para logging estruturado, deduplicação persistente
// e registro de transições de estado do bot.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Dedup persistente ──────────────────────────────────────────────
/**
 * Verifica e registra uma mensagem como processada de forma atômica.
 * Retorna `true` se a mensagem é duplicada (já foi vista), `false` se é nova.
 *
 * Usa INSERT com ON CONFLICT para garantir atomicidade entre múltiplas
 * execuções concorrentes da edge function.
 */
export async function checkAndMarkProcessed(
  supabase: SupabaseClient,
  messageId: string,
  instanceName: string,
): Promise<boolean> {
  if (!messageId) return false;

  try {
    // upsert + ignoreDuplicates: gera `ON CONFLICT DO NOTHING`,
    // não levanta exceção 23505 (que poluía o Postgres log) e nos diz
    // se a linha foi de fato inserida (via .select() retornando 0 ou 1 row).
    const { data, error } = await supabase
      .from("webhook_message_dedup")
      .upsert(
        { message_id: messageId, instance_name: instanceName },
        { onConflict: "message_id", ignoreDuplicates: true },
      )
      .select("message_id");

    if (error) {
      console.warn(`[dedup] erro upsert: ${error.code} ${error.message}`);
      return false; // fail-open
    }
    // data vazio → conflito (duplicado); data com 1 row → primeira vez
    return Array.isArray(data) && data.length === 0;
  } catch (e: any) {
    console.warn(`[dedup] exception: ${e?.message}`);
    return false;
  }
}


// ─── Bot step transitions (analytics) ────────────────────────────────
export async function logStepTransition(
  supabase: SupabaseClient,
  args: {
    customer_id?: string | null;
    consultant_id?: string | null;
    phone?: string | null;
    from_step?: string | null;
    to_step: string;
    duration_ms?: number | null;
    intent?: string | null;
    confidence?: number | null;
  },
): Promise<void> {
  if (!args.to_step) return;
  if (args.from_step === args.to_step) return; // não loga não-mudanças

  // Fire-and-forget — não bloqueia o webhook
  supabase
    .from("bot_step_transitions")
    .insert({
      customer_id: args.customer_id || null,
      consultant_id: args.consultant_id || null,
      phone: args.phone || null,
      from_step: args.from_step || null,
      to_step: args.to_step,
      duration_ms: args.duration_ms || null,
      intent: args.intent ?? null,
      confidence: args.confidence ?? null,
    })
    .then(({ error }: any) => {
      if (error) console.warn(`[step-transition] ${error.message}`);
    });
}

// ─── Logging estruturado ────────────────────────────────────────────
type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  correlation_id?: string;
  instance_name?: string;
  consultant_id?: string;
  customer_id?: string;
  phone?: string;
  step?: string;
  [key: string]: unknown;
}

export function jsonLog(level: LogLevel, message: string, context: LogContext = {}): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(JSON.stringify(entry));
}

export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
