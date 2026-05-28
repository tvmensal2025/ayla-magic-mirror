// Auto-takeover: ao consultor enviar QUALQUER coisa (texto, áudio, imagem, doc),
// pausamos o bot pra IA não falar por cima. Único ponto de verdade no frontend.
//
// Uso:
//   import { autoTakeoverByPhone } from "@/lib/whatsapp/auto-takeover";
//   await autoTakeoverByPhone(rawPhone, "humano_assumiu");

import { supabase } from "@/integrations/supabase/client";

type Reason =
  | "humano_assumiu"
  | "humano_assumiu_midia"
  | "humano_assumiu_audio"
  | "humano_assumiu_template"
  | "humano_assumiu_whatsapp";

/**
 * Reasons de pausa que NUNCA devem ser sobrescritas pelo auto-takeover.
 *
 * Quando o consultor está com pausa global ativa (ex.: testando flow D
 * com TODOS os leads no humano), o envio manual não pode trocar o
 * `bot_paused_reason` para `humano_assumiu` — isso quebraria a
 * lista "Pausa global" da UI e tiraria o lead do estado controlado.
 * Mantemos a pausa intacta; o lead já está com humano = consultor.
 */
const PRESERVED_PAUSE_REASONS = new Set<string>([
  "manual_global_pause",
  "humano_assumiu_backfill",
]);

async function applyPause(customerId: string, reason: Reason) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes?.user?.id || null;
  const patch = {
    bot_paused: true,
    bot_paused_reason: reason,
    bot_paused_at: new Date().toISOString(),
    bot_paused_until: null,
    assigned_human_id: uid,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("customers").update(patch).eq("id", customerId);
  if (error) {
    console.warn("[auto-takeover] update RLS falhou — tentando edge:", error.message);
    const { error: invErr } = await supabase.functions.invoke("customer-takeover", {
      body: { customerId, paused: true, reason },
    });
    if (invErr) {
      console.error("[auto-takeover] edge fallback falhou:", invErr.message);
      return false;
    }
  }
  return true;
}

export async function autoTakeoverByCustomerId(
  customerId: string,
  reason: Reason = "humano_assumiu",
): Promise<boolean> {
  const r = await takeoverByCustomerIdDetailed(customerId, reason);
  return r === "new" || r === "already";
}

export async function takeoverByCustomerIdDetailed(
  customerId: string,
  reason: Reason = "humano_assumiu",
): Promise<"new" | "already" | "fail"> {
  if (!customerId) return "fail";
  try {
    const { data: cust } = await supabase
      .from("customers")
      .select("id, bot_paused, bot_paused_reason, assigned_human_id")
      .eq("id", customerId)
      .maybeSingle();
    if (!cust) return "fail";
    // Pausa preservada (ex.: manual_global_pause) — não sobrescrever.
    // O lead já está pausado pelo consultor, envio manual segue normal.
    if (
      cust.bot_paused &&
      PRESERVED_PAUSE_REASONS.has(String(cust.bot_paused_reason || ""))
    ) {
      return "already";
    }
    if (cust.bot_paused && cust.assigned_human_id) return "already";
    const ok = await applyPause(customerId, reason);
    return ok ? "new" : "fail";
  } catch (e) {
    console.warn("[auto-takeover] erro inesperado:", e);
    return "fail";
  }
}

export async function autoTakeoverByPhone(
  rawPhone: string,
  reason: Reason = "humano_assumiu",
): Promise<boolean> {
  const r = await takeoverByPhoneDetailed(rawPhone, reason);
  return r === "new" || r === "already";
}

export async function takeoverByPhoneDetailed(
  rawPhone: string,
  reason: Reason = "humano_assumiu",
): Promise<"new" | "already" | "fail"> {
  const phoneDigits = (rawPhone || "").replace(/\D/g, "");
  if (!phoneDigits) return "fail";
  try {
    const { data: cust } = await supabase
      .from("customers")
      .select("id, bot_paused, bot_paused_reason, assigned_human_id")
      .eq("phone_whatsapp", phoneDigits)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cust) {
      console.warn(`[auto-takeover] nenhum customer encontrado para ${phoneDigits}`);
      return "fail";
    }
    // Pausa preservada (ex.: manual_global_pause) — não sobrescrever.
    if (
      cust.bot_paused &&
      PRESERVED_PAUSE_REASONS.has(String(cust.bot_paused_reason || ""))
    ) {
      return "already";
    }
    if (cust.bot_paused && cust.assigned_human_id) return "already";
    const ok = await applyPause(cust.id, reason);
    return ok ? "new" : "fail";
  } catch (e) {
    console.warn("[auto-takeover] erro inesperado:", e);
    return "fail";
  }
}

/** Desfaz o takeover: religa o bot e remove a vinculação humana. */
export async function undoTakeoverByPhone(rawPhone: string): Promise<boolean> {
  const phoneDigits = (rawPhone || "").replace(/\D/g, "");
  if (!phoneDigits) return false;
  try {
    const { data: cust } = await supabase
      .from("customers")
      .select("id")
      .eq("phone_whatsapp", phoneDigits)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cust) return false;
    const patch = {
      bot_paused: false,
      bot_paused_reason: null,
      bot_paused_until: null,
      assigned_human_id: null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("customers").update(patch).eq("id", cust.id);
    if (error) {
      const { error: invErr } = await supabase.functions.invoke("customer-takeover", {
        body: { customerId: cust.id, paused: false },
      });
      if (invErr) return false;
    }
    return true;
  } catch {
    return false;
  }
}

