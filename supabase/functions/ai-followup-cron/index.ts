// AI Follow-up Cron — roda a cada 15 min via pg_cron.
// Busca leads cujo next_followup_at já venceu e aciona o ai-sales-agent
// para a IA decidir a próxima ação (mensagem de resgate, mídia, etc).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startedAt = Date.now();
  const nowIso = new Date().toISOString();

  try {
    const { data: leads, error } = await supabase
      .from("customers")
      .select("id, consultant_id, phone_whatsapp, sales_phase, name")
      .lte("next_followup_at", nowIso)
      .not("next_followup_at", "is", null)
      .neq("sales_phase", "perdido")
      .neq("status", "completed")
      .eq("bot_paused", false)
      .limit(50);

    if (error) throw error;

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const lead of leads ?? []) {
      try {
        // Limpa o slot ANTES para evitar reprocessamento em caso de falha do agent.
        await supabase
          .from("customers")
          .update({ next_followup_at: null })
          .eq("id", lead.id);

        const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-sales-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            customer_id: lead.id,
            consultant_id: lead.consultant_id,
            phone: lead.phone_whatsapp,
            user_input: "[FOLLOWUP_CRON]",
            user_input_kind: "system",
            trigger: "followup",
          }),
        });

        results.push({ id: lead.id, ok: resp.ok, error: resp.ok ? undefined : `HTTP ${resp.status}` });
      } catch (e: any) {
        results.push({ id: lead.id, ok: false, error: e?.message ?? String(e) });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: results.length,
        success: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        latency_ms: Date.now() - startedAt,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[ai-followup-cron] erro:", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
