// Helpers compartilhados para logging estruturado, deduplicação persistente
// e registro de transições de estado do bot.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Dedup persistente ──────────────────────────────────────────────
// A implementação canônica vive em `_shared/bot/dedupe.ts` (UNIQUE composto
// `(message_id, instance_name)`, fail-open). Reexportamos daqui para
// preservar a interface histórica `import { checkAndMarkProcessed } from "_shared/audit.ts"`.
export { checkAndMarkProcessed } from "./bot/dedupe.ts";


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
