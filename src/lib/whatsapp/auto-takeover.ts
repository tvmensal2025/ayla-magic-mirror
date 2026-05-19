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
  if (!customerId) return false;
  try {
    const { data: cust } = await supabase
      .from("customers")
      .select("id, bot_paused, assigned_human_id")
      .eq("id", customerId)
      .maybeSingle();
    if (!cust) return false;
    if (cust.bot_paused && cust.assigned_human_id) return true; // já pausado por humano
    return await applyPause(customerId, reason);
  } catch (e) {
    console.warn("[auto-takeover] erro inesperado:", e);
    return false;
  }
}

export async function autoTakeoverByPhone(
  rawPhone: string,
  reason: Reason = "humano_assumiu",
): Promise<boolean> {
  const phoneDigits = (rawPhone || "").replace(/\D/g, "");
  if (!phoneDigits) return false;
  try {
    const { data: cust } = await supabase
      .from("customers")
      .select("id, bot_paused, assigned_human_id")
      .eq("phone_whatsapp", phoneDigits)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cust) {
      console.warn(`[auto-takeover] nenhum customer encontrado para ${phoneDigits}`);
      return false;
    }
    if (cust.bot_paused && cust.assigned_human_id) return true;
    return await applyPause(cust.id, reason);
  } catch (e) {
    console.warn("[auto-takeover] erro inesperado:", e);
    return false;
  }
}
