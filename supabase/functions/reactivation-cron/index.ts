// Reactivation cron — roda 1x/hora.
// 1) Classifica outcomes pendentes (reactivation_sends.outcome via RPC).
// 2) Para templates com auto_reactivate=true, envia reaquecimento aos leads parados
//    respeitando janela 09h-20h no fuso do consultor, max 3 tentativas, batch 500.
//
// Reqs: 15, 16.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEvolutionSender } from "../_shared/evolution-api.ts";
import { jsonLog, captureError } from "../_shared/audit.ts";

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Retorna a hora local (0-23) e dia da semana (0=domingo, 6=sábado) do consultor. */
function localHourAndDay(timezone: string): { hour: number; day: number } {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
      weekday: "short",
    });
    const parts = fmt.formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { hour, day: dayMap[weekday] ?? 1 };
  } catch {
    // fallback America/Sao_Paulo
    const now = new Date();
    return { hour: now.getUTCHours() - 3, day: now.getUTCDay() };
  }
}

function isInsideBusinessWindow(timezone: string): boolean {
  const { hour, day } = localHourAndDay(timezone);
  // segunda-sexta, 9h-20h
  if (day === 0 || day === 6) return false;
  return hour >= 9 && hour < 20;
}

function renderVars(template: string, customer: any, consultantName: string): string {
  if (!template) return "";
  const firstName = String(customer.name || "").trim().split(/\s+/)[0] || "";
  const valor = customer.electricity_bill_value
    ? Number(customer.electricity_bill_value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";
  return template
    .replaceAll("{{nome}}", firstName)
    .replaceAll("{{valor_conta}}", valor)
    .replaceAll("{{representante}}", consultantName)
    .replaceAll(/\{\{[a-zA-Z_]+\}\}/g, "");
}

interface ProcessResult {
  templates_processed: number;
  total_sent: number;
  total_failed: number;
  total_skipped_window: number;
  total_skipped_capture_mode: number;
}

async function processAutoReactivation(supabase: any): Promise<ProcessResult> {
  let templatesProcessed = 0;
  let totalSent = 0;
  let totalFailed = 0;
  let totalSkippedWindow = 0;
  let totalSkippedCaptureMode = 0;

  // Templates ativos com auto_reactivate=true
  const { data: templates } = await supabase
    .from("reactivation_templates")
    .select(`
      id, consultant_id, conversation_step, message_text,
      consultants:consultant_id (id, name, timezone)
    `)
    .eq("is_active", true)
    .eq("auto_reactivate", true);

  if (!templates || templates.length === 0) {
    jsonLog("info", "reactivation_cron_no_templates", {});
    return { templates_processed: 0, total_sent: 0, total_failed: 0, total_skipped_window: 0, total_skipped_capture_mode: 0 };
  }

  for (const tpl of templates as any[]) {
    templatesProcessed++;
    const consultant = tpl.consultants;
    if (!consultant) continue;

    const tz = consultant.timezone || "America/Sao_Paulo";
    if (!isInsideBusinessWindow(tz)) {
      jsonLog("info", "reactivation_cron_outside_window", {
        consultant_id: tpl.consultant_id,
        timezone: tz,
        template_id: tpl.id,
      });
      continue;
    }

    // Busca instância WhatsApp do consultor
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("consultant_id", tpl.consultant_id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!instance?.instance_name) continue;

    const sender = createEvolutionSender(EVOLUTION_API_URL, EVOLUTION_API_KEY, instance.instance_name);
    const consultantName = String(consultant.name || "iGreen").split(/\s+/)[0];

    // Leads parados nesse step com:
    //   - consultant_id do template
    //   - capture_mode='auto' OR manual_override_reactivate=true (Req 17.5)
    //   - menos de 3 envios automáticos prévios pra esse template
    //   - sem envio nas últimas 48h
    const { data: candidates } = await supabase
      .from("customers")
      .select("id, name, phone_whatsapp, conversation_step, consultant_id, electricity_bill_value, capture_mode, manual_override_reactivate, updated_at")
      .eq("consultant_id", tpl.consultant_id)
      .eq("conversation_step", tpl.conversation_step)
      .not("status", "in", "(approved,cancelled)")
      .lt("updated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(500);

    if (!candidates || candidates.length === 0) continue;

    for (const customer of candidates as any[]) {
      // Respeita capture_mode='manual' (Req 17.5)
      if (customer.capture_mode === "manual" && !customer.manual_override_reactivate) {
        totalSkippedCaptureMode++;
        continue;
      }

      // Conta envios automáticos prévios pra esse template (max 3)
      const { count: prevCount } = await supabase
        .from("reactivation_sends")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customer.id)
        .eq("template_id", tpl.id)
        .eq("trigger_type", "auto");
      if ((prevCount ?? 0) >= 3) continue;

      // Tem envio nas últimas 48h?
      const { count: recentCount } = await supabase
        .from("reactivation_sends")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customer.id)
        .gte("sent_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());
      if ((recentCount ?? 0) > 0) continue;

      // Envia
      const finalText = renderVars(tpl.message_text, customer, consultantName);
      const remoteJid = `${customer.phone_whatsapp}@s.whatsapp.net`;
      try {
        const ok = await sender.sendText(remoteJid, finalText);
        if (ok) {
          totalSent++;
          await supabase.from("reactivation_sends").insert({
            customer_id: customer.id,
            consultant_id: tpl.consultant_id,
            template_id: tpl.id,
            conversation_step: customer.conversation_step,
            message_text: finalText,
            trigger_type: "auto",
            status: "sent",
          });
          await supabase.from("conversations").insert({
            customer_id: customer.id,
            message_direction: "outbound",
            message_text: finalText,
            message_type: "text",
            conversation_step: customer.conversation_step,
          });
        } else {
          totalFailed++;
          await supabase.from("reactivation_sends").insert({
            customer_id: customer.id,
            consultant_id: tpl.consultant_id,
            template_id: tpl.id,
            conversation_step: customer.conversation_step,
            message_text: finalText,
            trigger_type: "auto",
            status: "failed",
            error_reason: "evolution_send_failed",
          });
        }
      } catch (e) {
        totalFailed++;
        await supabase.from("reactivation_sends").insert({
          customer_id: customer.id,
          consultant_id: tpl.consultant_id,
          template_id: tpl.id,
          conversation_step: customer.conversation_step,
          message_text: finalText,
          trigger_type: "auto",
          status: "failed",
          error_reason: e instanceof Error ? e.message : String(e),
        });
      }
      // 2s entre envios (Req 14.3 / 15)
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return {
    templates_processed: templatesProcessed,
    total_sent: totalSent,
    total_failed: totalFailed,
    total_skipped_window: totalSkippedWindow,
    total_skipped_capture_mode: totalSkippedCaptureMode,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Classifica outcomes pendentes (Req 16)
    const { data: classified } = await supabase.rpc("classify_reactivation_outcomes");
    const outcomeRow = Array.isArray(classified) && classified[0] ? classified[0] : {};

    // 2) Processa auto_reactivate (Req 15)
    const result = await processAutoReactivation(supabase);

    jsonLog("info", "reactivation_cron_done", {
      ...result,
      outcomes_classified: outcomeRow,
    });

    return new Response(JSON.stringify({
      ok: true,
      outcomes_classified: outcomeRow,
      auto_reactivation: result,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    captureError(err, { tags: { function: "reactivation-cron" } });
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
