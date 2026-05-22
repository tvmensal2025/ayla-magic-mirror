// Sprint 2.6 + bugfix `whatsapp-flow-reliability-fix` (Task 7)
//
// Idempotência do webhook: a Evolution e o Whapi às vezes reentregam o mesmo
// `message_id` por timeout (200 perdido na rota). Sem dedupe, o mesmo turno é
// processado duas vezes em paralelo e o cliente recebe a mesma mensagem (ou
// avança dois passos do funil em vez de um).
//
// Tabela canônica: `public.webhook_message_dedup`. Antes existia o espelho
// `webhook_message_dedupe` (com "e"), removido em 2026-05-19.
//
// **Constraint obrigatória:** UNIQUE composto em `(message_id, instance_name)`.
// Adicionado por `20260519124511_*.sql` e o PRIMARY KEY antigo em só
// `message_id` é dropado por `20260521170000_whatsapp_flow_reliability_v2.sql`.
// O ON CONFLICT abaixo depende desse índice composto: dois `instance_name`
// diferentes não se atrapalham (isolamento multi-tenant).
//
// TTL de 24h via pg_cron (`20260417095057_*.sql`).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export interface DedupeResult {
  duplicate: boolean;
  /** Razão para log/debug: "hit" (linha existia via ON CONFLICT DO NOTHING) ou null. */
  reason: "hit" | null;
}

/**
 * Reserva atômica do par `(messageId, instanceName)` em `webhook_message_dedup`.
 *
 * Retorna:
 *  - `true`  → mensagem **já foi processada** (duplicate, segundo executor curto-circuita)
 *  - `false` → primeira vez (siga o fluxo)
 *
 * Usa upsert + ignoreDuplicates: gera `INSERT ... ON CONFLICT DO NOTHING`,
 * portanto não levanta exceção 23505 (que poluía o Postgres log a cada retry).
 * O `.select()` informa quantas linhas foram efetivamente inseridas:
 *   - 1 row → INSERT venceu (não é duplicado)
 *   - 0 rows → conflito (já existia, é duplicado)
 *
 * Em qualquer erro inesperado de rede/banco, retorna `false` (fail-open) para
 * **não silenciar o cliente** por causa de um hiccup transitório. A trade-off
 * aqui é deliberada: melhor correr risco de duplicar 1 mensagem rara do que
 * deixar o cliente sem resposta para sempre.
 */
export async function checkAndMarkProcessed(
  supabase: SupabaseClient,
  messageId: string | null | undefined,
  instanceName: string | null | undefined,
): Promise<boolean> {
  if (!messageId) return false;
  if (!instanceName) {
    console.warn("[bot/dedupe] instance_name ausente — fail-open");
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("webhook_message_dedup")
      .upsert(
        {
          message_id: messageId,
          instance_name: instanceName,
          processed_at: new Date().toISOString(),
        },
        { onConflict: "message_id,instance_name", ignoreDuplicates: true },
      )
      .select("message_id");

    if (error) {
      console.warn(
        `[bot/dedupe] erro upsert (${(error as any).code ?? "?"}): ${
          (error as any).message ?? String(error)
        } — fail-open`,
      );
      return false;
    }

    // Empty array → ON CONFLICT DO NOTHING não inseriu (já existia).
    const isDuplicate = Array.isArray(data) && data.length === 0;
    if (isDuplicate) {
      console.log(
        `[bot/dedupe] 🔁 hit: ${messageId} já processado para instance=${instanceName}`,
      );
    }
    return isDuplicate;
  } catch (e: any) {
    console.warn(
      `[bot/dedupe] exception: ${e?.message ?? String(e)} — fail-open`,
    );
    return false;
  }
}

/**
 * @deprecated Use `checkAndMarkProcessed` direto. Mantido como alias durante
 * a migração das chamadas dos handlers conversational. O retorno encapsulado
 * não acrescenta nada além de um campo `reason` para log.
 */
export async function checkAndMarkWebhookDedupe(
  supabase: SupabaseClient,
  messageId: string | null | undefined,
  instanceName: string | null | undefined,
): Promise<DedupeResult> {
  const isDup = await checkAndMarkProcessed(supabase, messageId, instanceName);
  return { duplicate: isDup, reason: isDup ? "hit" : null };
}
