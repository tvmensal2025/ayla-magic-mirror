// Task 27 + 28 (whatsapp-flow-reliability-fix): persistência da "cauda"
// (tail) de uma sequência outbound longa.
//
// Problema (B5 do bugfix.md, condição 2.26):
//   Quando uma sequência de mídias acumula >50s de delays, a Edge Function
//   atinge timeout e a cauda (mídias não enviadas) é perdida silenciosamente.
//   O lead recebe metade do conteúdo e o bot fica em estado inconsistente.
//
// Solução:
//   1. `runConversationalFlow` / `ai-agent-router` mantém um "wallclock budget"
//      (default 50s). Antes de cada `sleep`, checa quanto já gastou.
//   2. Se faltam itens E o budget acabou, chama `enqueueOutboundTail()` com
//      o restante do payload. Itens são persistidos em `pending_outbound_media`
//      com `scheduled_for = now() + delayJaAcumulado`.
//   3. O cron `outbound-media-flush-cron` (chamado de 5 em 5s) lê itens
//      `scheduled_for <= now() AND succeeded_at IS NULL`, despacha, marca
//      `succeeded_at`. Em falha, incrementa `attempts` e reagenda
//      (1min, 5min, 15min).
//
// Esta função é AUXILIAR — apenas constrói o payload e enfileira. O envio
// fica por conta do cron.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logStructured } from "./utils.ts";

/**
 * Item de mídia/texto a ser enviado, em forma serializável.
 *
 * `delay_before_ms` é o sleep que o cron deve aplicar ANTES de enviar este item
 * (para preservar o ritmo humano original). O cron NÃO tenta recalcular pacing
 * — só obedece o que foi pré-computado pelo caller.
 */
export interface PendingOutboundItem {
  kind: "text" | "image" | "audio" | "video" | "document" | "buttons";
  /** Texto (para `kind=text` / `buttons`). */
  text?: string;
  /** URL absoluta (para mídia) ou base64 (data: URI). */
  media_url?: string;
  /** MIME type (opcional, ajuda Evolution a decidir endpoint). */
  mime_type?: string;
  /** Caption opcional (para imagem/vídeo). */
  caption?: string;
  /** Botões (quando kind=buttons). */
  buttons?: Array<{ id: string; title: string }>;
  /** Delay em ms antes de enviar este item. Default 0. */
  delay_before_ms?: number;
}

export interface EnqueueOutboundTailInput {
  supabase: SupabaseClient;
  customerId: string;
  consultantId: string;
  /** Telefone do lead em formato Evolution (`5511...@s.whatsapp.net` ou só número). */
  remoteJid: string;
  /** Instância Evolution (ou nome equivalente em outros canais). */
  instanceName?: string;
  /** Items que faltam enviar. Ordem importa. */
  items: PendingOutboundItem[];
  /**
   * Quando despachar o primeiro item (UTC). Default `now()`.
   * Útil pra dar uma folga para o lead "respirar" após a metade já enviada.
   */
  firstScheduledAt?: Date;
}

const DEFAULT_FIRST_SCHEDULE_DELAY_MS = 1500;

/**
 * Insere uma linha em `pending_outbound_media` com a cauda da sequência.
 * Cada chamada cria UMA linha — o cron desempacota o array `items` e envia
 * em sequência respeitando os `delay_before_ms`.
 *
 * Retorna o id da row inserida (ou null em caso de erro — caller deve logar).
 *
 * Falha silenciosa é por design: se a fila falhar, o melhor é o lead
 * receber metade da sequência do que receber zero porque o webhook
 * inteiro falhou.
 */
export async function enqueueOutboundTail(
  input: EnqueueOutboundTailInput,
): Promise<number | null> {
  if (!input.items || input.items.length === 0) return null;

  const scheduledFor =
    input.firstScheduledAt ?? new Date(Date.now() + DEFAULT_FIRST_SCHEDULE_DELAY_MS);

  const payload = {
    remote_jid: input.remoteJid,
    instance_name: input.instanceName ?? null,
    items: input.items,
  };

  try {
    const { data, error } = await input.supabase
      .from("pending_outbound_media")
      .insert({
        consultant_id: input.consultantId,
        customer_id: input.customerId,
        payload,
        scheduled_for: scheduledFor.toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      logStructured("error", "pending_outbound_media_enqueue_failed", {
        customer_id: input.customerId,
        consultant_id: input.consultantId,
        error: error.message,
      });
      return null;
    }

    logStructured("info", "pending_outbound_media_enqueued", {
      pending_id: data?.id,
      customer_id: input.customerId,
      consultant_id: input.consultantId,
      item_count: input.items.length,
      scheduled_for: scheduledFor.toISOString(),
    });

    return (data as { id: number })?.id ?? null;
  } catch (e: any) {
    logStructured("error", "pending_outbound_media_enqueue_exception", {
      customer_id: input.customerId,
      consultant_id: input.consultantId,
      error: e?.message ?? String(e),
    });
    return null;
  }
}

/**
 * Helper opcional: dado um array de itens com `delay_before_ms` e um
 * `budgetMs`, retorna `{ head, tail }` onde `head` é o que cabe no orçamento
 * e `tail` é o restante. Caller pode passar `tail` direto para
 * `enqueueOutboundTail`.
 *
 * Exemplo:
 *   const { head, tail } = splitByBudget(items, 50_000);
 *   for (const it of head) await sendInline(it);
 *   if (tail.length > 0) await enqueueOutboundTail({ items: tail, ... });
 *
 * Função pura. Determinística.
 */
export function splitByBudget<T extends { delay_before_ms?: number }>(
  items: T[],
  budgetMs: number,
): { head: T[]; tail: T[]; spentMs: number } {
  const head: T[] = [];
  const tail: T[] = [];
  let spent = 0;
  let budgetExceeded = false;

  for (const item of items) {
    const cost = Math.max(0, item.delay_before_ms ?? 0);
    if (budgetExceeded || spent + cost > budgetMs) {
      budgetExceeded = true;
      tail.push(item);
    } else {
      spent += cost;
      head.push(item);
    }
  }

  return { head, tail, spentMs: spent };
}
