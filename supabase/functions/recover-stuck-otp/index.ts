// Edge function executada via cron diário.
// Identifica leads parados em `awaiting_otp` há mais de 24h e os requeue
// enviando uma mensagem de follow-up via Evolution API.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

const STUCK_HOURS = 24;
const FOLLOWUP_MESSAGE =
  "🔔 Olá! Notamos que ainda estamos aguardando o código de verificação para finalizar seu cadastro na iGreen Energy.\n\n" +
  "📱 Por favor, verifique suas mensagens no WhatsApp e nos envie o código aqui.\n\n" +
  "Se você não recebeu o código ou precisa de ajuda, é só responder esta mensagem!";

async function sendWhatsAppText(instanceName: string, remoteJid: string, text: string) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) return false;
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${instanceName}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({ number: remoteJid, text }),
    });
    return res.ok;
  } catch (e) {
    console.error(`[recover-stuck-otp] sendText failed: ${(e as Error).message}`);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ─── Auth: only the cron job (with shared secret) can trigger this ─────
  const expectedSecret = Deno.env.get("CRON_SECRET") || Deno.env.get("WORKER_SECRET");
  const providedSecret = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (expectedSecret && providedSecret !== expectedSecret) {
    console.warn("[recover-stuck-otp] Unauthorized attempt");
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() - STUCK_HOURS * 3600_000).toISOString();

  // Buscar leads em awaiting_otp ou aguardando_otp há mais de N horas
  const { data: stuck, error } = await supabase
    .from("customers")
    .select("id, name, phone_whatsapp, consultant_id, status, conversation_step, updated_at, otp_received_at")
    .or("status.eq.awaiting_otp,conversation_step.eq.aguardando_otp")
    .lt("updated_at", cutoff)
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ id: string; sent: boolean; reason?: string }> = [];

  for (const lead of stuck || []) {
    if (!lead.consultant_id) {
      results.push({ id: lead.id, sent: false, reason: "no_consultant" });
      continue;
    }

    // Buscar instance_name do consultor
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("consultant_id", lead.consultant_id)
      .maybeSingle();

    if (!instance?.instance_name) {
      results.push({ id: lead.id, sent: false, reason: "no_instance" });
      continue;
    }

    const remoteJid = `${lead.phone_whatsapp}@s.whatsapp.net`;
    const sent = await sendWhatsAppText(instance.instance_name, remoteJid, FOLLOWUP_MESSAGE);

    if (sent) {
      // Marcar como reativado para não mandar de novo amanhã
      await supabase
        .from("customers")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", lead.id);

      await supabase.from("conversations").insert({
        customer_id: lead.id,
        message_direction: "outbound",
        message_text: FOLLOWUP_MESSAGE,
        message_type: "text",
        conversation_step: "stuck_otp_followup",
      });
    }

    results.push({ id: lead.id, sent });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed: results.length,
      sent: results.filter((r) => r.sent).length,
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
