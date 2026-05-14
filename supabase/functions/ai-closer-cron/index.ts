// Cron a cada 10 min: identifica leads parados em fases finais (fechamento, coleta_doc,
// coleta_dados, cadastro_portal) sem outbound recente e dispara o ai-sales-agent em modo "rescue".
// Acelera fechamento sem precisar de humano.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STALE_PHASES = ["fechamento", "coleta_doc", "coleta_dados", "objecoes", "cadastro_portal"];
const STALE_MIN_MIN = 25;     // só age depois de 25 min sem ação
const STALE_MAX_HOURS = 48;   // não persegue lead frio > 48h
const MAX_PER_RUN = 30;
const MAX_RESCUES_PER_LEAD = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const minAgo = new Date(Date.now() - STALE_MIN_MIN * 60_000).toISOString();
  const maxAgo = new Date(Date.now() - STALE_MAX_HOURS * 3600_000).toISOString();

  // Candidatos: customers em fase final, bot ativo, atualizado entre maxAgo e minAgo
  const { data: candidates, error } = await supa
    .from("customers")
    .select("id, consultant_id, conversation_step, sales_phase, updated_at, bot_paused, ai_rescue_count, phone_whatsapp")
    .in("sales_phase", STALE_PHASES)
    .eq("bot_paused", false)
    .gte("updated_at", maxAgo)
    .lte("updated_at", minAgo)
    .order("updated_at", { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let triggered = 0, skipped = 0;
  for (const c of candidates || []) {
    if ((c.ai_rescue_count || 0) >= MAX_RESCUES_PER_LEAD) { skipped++; continue; }
    if (!c.phone_whatsapp || !c.consultant_id) { skipped++; continue; }

    // Resolve instance via whatsapp_instances
    const { data: inst } = await supa
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("consultant_id", c.consultant_id)
      .maybeSingle();
    if (!inst?.instance_name) { skipped++; continue; }

    try {
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-sales-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          customer_id: c.id,
          mode: "rescue",
          remote_jid: c.phone_whatsapp.replace(/\D/g, "") + "@s.whatsapp.net",
          instance_name: inst.instance_name,
          source: "closer_cron",
        }),
      });

      if (res.ok) {
        triggered++;
        await supa.from("customers")
          .update({ ai_rescue_count: (c.ai_rescue_count || 0) + 1, ai_last_rescue_at: new Date().toISOString() })
          .eq("id", c.id);
      } else {
        skipped++;
      }
    } catch (e) {
      console.error("rescue fail", c.id, (e as Error).message);
      skipped++;
    }
  }

  return new Response(JSON.stringify({ ok: true, candidates: candidates?.length || 0, triggered, skipped }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
