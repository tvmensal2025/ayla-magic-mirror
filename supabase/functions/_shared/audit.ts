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
    const { error } = await supabase
      .from("webhook_message_dedup")
      .insert({ message_id: messageId, instance_name: instanceName });

    if (error) {
      // 23505 = unique_violation → duplicado
      if (error.code === "23505") return true;
      console.warn(`[dedup] erro insert: ${error.code} ${error.message}`);
      return false; // em caso de erro, processa (fail-open)
    }
    return false;
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
