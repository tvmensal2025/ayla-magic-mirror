/**
 * bot-followup-checker
 *
 * Roda via pg_cron (a cada 30min). Identifica clientes que sumiram no meio
 * da conversa e dispara um follow-up amigável via Whapi.
 *
 * Regras:
 *  - last_bot_interaction_at entre 6h e 48h atrás
 *  - bot_paused_until = null
 *  - followup_count = 0
 *  - conversation_step não está em cadastro/finalizado
 *
 * Após 48h sem resposta ao follow-up: marca deal CRM como 'frio'.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createWhapiSender } from "../_shared/whapi-api.ts";
import { isQuietHourBRT, logQuietSkip } from "../_shared/quiet-hours.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TERMINAL_STEPS = new Set([
  "complete", "portal_submitting", "portal_submitted", "registered_igreen",
  "awaiting_signature", "finalizando", "validando_otp", "aguardando_humano",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settingsRows } = await supabase.from("settings").select("*");
    const settings: Record<string, string> = {};
    settingsRows?.forEach((s: any) => { settings[s.key] = s.value; });
    const whapiToken = settings.whapi_token || Deno.env.get("WHAPI_TOKEN") || "";
    if (!whapiToken) {
      return new Response(JSON.stringify({ error: "no whapi token" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sender = createWhapiSender(whapiToken);

    const now = Date.now();
    const sixHoursAgo = new Date(now - 6 * 60 * 60 * 1000).toISOString();
    const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000).toISOString();

    // ─── 1. Candidatos a follow-up #1 ────────────────────────────────
    const { data: candidates } = await supabase
      .from("customers")
      .select("id, name, phone_whatsapp, conversation_step, followup_count, last_bot_interaction_at, consultant_id")
      .lte("last_bot_interaction_at", sixHoursAgo)
      .gte("last_bot_interaction_at", fortyEightHoursAgo)
      .eq("followup_count", 0)
      .is("bot_paused_until", null)
      .limit(50);

    let sent = 0;
    for (const c of candidates || []) {
      if (TERMINAL_STEPS.has(c.conversation_step || "")) continue;
      if (!c.phone_whatsapp) continue;
      const firstName = (c.name || "").split(" ")[0] || "";
      const msg = firstName
        ? `Oi ${firstName}, ainda está aí? 🙂 Posso continuar te ajudando quando quiser.`
        : `Oi! Ainda está aí? 🙂 Posso continuar te ajudando quando quiser.`;
      try {
        await sender.sendText(`${c.phone_whatsapp}@s.whatsapp.net`, msg);
        await supabase.from("customers").update({
          followup_count: 1,
          last_followup_at: new Date().toISOString(),
        }).eq("id", c.id);
        await supabase.from("conversations").insert({
          customer_id: c.id,
          message_direction: "outbound",
          message_text: msg,
          message_type: "text",
          conversation_step: c.conversation_step,
        });
        sent++;
      } catch (e) {
        console.error(`followup falhou ${c.id}`, (e as Error).message);
      }
    }

    // ─── 2. Marcar como "frio" quem não respondeu ao follow-up ──────
    const { data: cold } = await supabase
      .from("customers")
      .select("id, consultant_id")
      .gte("followup_count", 1)
      .lte("last_followup_at", fortyEightHoursAgo)
      .is("bot_paused_until", null)
      .limit(50);

    let cooled = 0;
    for (const c of cold || []) {
      // Marca deal CRM como 'frio' se ainda não estiver finalizado
      const { data: deal } = await supabase
        .from("crm_deals")
        .select("id, stage")
        .eq("customer_id", c.id)
        .eq("consultant_id", c.consultant_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (deal && !["aprovado", "rejeitado", "frio"].includes(deal.stage || "")) {
        await supabase.from("crm_deals")
          .update({ stage: "frio", notes: "Auto-marcado como frio: sem resposta após follow-up." })
          .eq("id", deal.id);
        cooled++;
      }
      // Evita re-processar
      await supabase.from("customers").update({ followup_count: 2 }).eq("id", c.id);
    }

    return new Response(JSON.stringify({ ok: true, followups_sent: sent, cooled_deals: cooled }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("bot-followup-checker error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
