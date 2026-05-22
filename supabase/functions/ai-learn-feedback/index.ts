// Cron diário: agrega ai_decisions com feedback do consultor (👍/👎)
// e atualiza ai_learned_patterns por (consultant_id, intent).
// Também processa feedbacks manuais sem intent (usa tool_called como chave).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Busca decisões dos últimos 30 dias com feedback registrado
    // Inclui tanto as que têm intent_detected quanto as sem (usa tool_called como fallback)
    const { data: rows } = await supabase
      .from("ai_decisions")
      .select("consultant_id, intent_detected, tool_called, ai_output, feedback, user_input, reply_sent, created_at")
      .not("feedback", "is", null)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(2000);

    type Bucket = { good: any[]; bad: any[] };
    const acc: Record<string, Bucket> = {};

    for (const r of (rows || [])) {
      // Usa intent_detected se disponível; senão usa tool_called como chave de agrupamento
      const intent = r.intent_detected || (r.tool_called ? `tool:${r.tool_called}` : null);
      if (!intent) continue;

      const key = `${r.consultant_id}::${intent}`;
      if (!acc[key]) acc[key] = { good: [], bad: [] };

      const rating = (r.feedback as any)?.rating;
      const source = (r.feedback as any)?.source || "manual";

      // Pula feedbacks automáticos de handoff para o bucket "bad" — eles já são contados
      // separadamente e não devem dominar os exemplos negativos
      if (source === "auto_handoff" && rating === "down" && acc[key].bad.length >= 2) continue;

      const sample = {
        input: (r.user_input || "").slice(0, 120),
        output: (
          r.reply_sent ||
          (r.ai_output as any)?.message ||
          (r.ai_output as any)?.caption ||
          ""
        ).slice(0, 200),
        source,
      };

      if (rating === "up" && acc[key].good.length < 5) acc[key].good.push(sample);
      if (rating === "down" && acc[key].bad.length < 5) acc[key].bad.push(sample);
    }

    let upserted = 0;
    for (const [key, bucket] of Object.entries(acc)) {
      const [consultant_id, intent] = key.split("::");
      if (!consultant_id || !intent) continue;
      if (bucket.good.length === 0 && bucket.bad.length === 0) continue;

      await supabase.from("ai_learned_patterns").upsert({
        consultant_id,
        intent,
        good_examples: bucket.good,
        bad_examples: bucket.bad,
        sample_count: bucket.good.length + bucket.bad.length,
        updated_at: new Date().toISOString(),
      }, { onConflict: "consultant_id,intent" });
      upserted++;
    }

    return new Response(JSON.stringify({ ok: true, upserted, processed: rows?.length || 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-learn-feedback error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
