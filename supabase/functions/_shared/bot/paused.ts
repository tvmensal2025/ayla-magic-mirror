// Single source of truth: "humano assumiu o controle" → IA TOTALMENTE silenciosa.
//
// Quando qualquer um destes for verdade, NENHUM cron, scheduler ou webhook deve
// disparar mensagem automática para o cliente:
//   - bot_paused === true  (consultor clicou "Assumir")
//   - assigned_human_id IS NOT NULL  (humano vinculado)
//   - bot_paused_until > now()  (pausa programada ainda no futuro)
//
// Use isCustomerPausedByHuman() em memória OU pausedFilter() para queries
// Supabase (precisa rodar checagem extra por causa da limitação de OR no client).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export interface PausableCustomer {
  bot_paused?: boolean | null;
  assigned_human_id?: string | null;
  bot_paused_until?: string | null;
}

export function isCustomerPausedByHuman(c: PausableCustomer | null | undefined): boolean {
  if (!c) return false;
  if (c.bot_paused === true) return true;
  if (c.assigned_human_id) return true;
  if (c.bot_paused_until) {
    try {
      if (new Date(c.bot_paused_until).getTime() > Date.now()) return true;
    } catch { /* ignore */ }
  }
  return false;
}

/**
 * Verifica diretamente no DB se o customer está pausado por humano.
 * Usar em loops/scheduled jobs onde só se tem phone+consultant_id.
 */
export async function isPausedByPhone(
  supabase: SupabaseClient,
  phone: string,
  consultantId?: string | null,
): Promise<boolean> {
  if (!phone) return false;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return false;
  let q = supabase
    .from("customers")
    .select("bot_paused, assigned_human_id, bot_paused_until")
    .eq("phone_whatsapp", digits)
    .limit(1);
  if (consultantId) q = q.eq("consultant_id", consultantId);
  const { data } = await q.maybeSingle();
  return isCustomerPausedByHuman(data as PausableCustomer | null);
}
