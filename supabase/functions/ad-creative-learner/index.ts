// Cron diário: analisa últimos 30 dias de criativos por consultor,
// identifica padrões vencedores/perdedores e gera recomendações.
import { adminClient, corsHeaders } from "../_shared/fb-graph.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface AdRow {
  id: string;
  fb_ad_id: string;
  consultant_id: string;
  campaign_id: string;
  distribuidora: string | null;
  headline: string | null;
  primary_text: string | null;
  framework: string | null;
  impressions: number;
  clicks: number;
  leads: number;
  registrations: number;
  spend_cents: number;
  score: number;
}

function scoreOf(m: { spend_cents: number; clicks: number; leads: number; registrations: number }): number {
  return m.registrations * 100 + m.leads * 10 + m.clicks * 1 - m.spend_cents / 100;
}

async function summarizeWithAI(samples: { winners: AdRow[]; losers: AdRow[] }): Promise<{
  winning_patterns: string[];
  losing_patterns: string[];
  best_image_traits: string[];
  summary: string;
} | null> {
  if (!LOVABLE_API_KEY) return null;
  const w = samples.winners.slice(0, 5).map(s => `[${s.framework || "?"}] "${s.headline}" — ${s.primary_text} | leads:${s.leads} cad:${s.registrations} R$:${(s.spend_cents/100).toFixed(2)}`).join("\n");
  const l = samples.losers.slice(0, 5).map(s => `[${s.framework || "?"}] "${s.headline}" — ${s.primary_text} | leads:${s.leads} cad:${s.registrations} R$:${(s.spend_cents/100).toFixed(2)}`).join("\n");
  const prompt = `Você é analista de copy de Facebook Ads em pt-BR. Analise os anúncios abaixo e extraia padrões.

VENCEDORES (geraram leads/cadastros):
${w || "(nenhum)"}

PERDEDORES (gastaram sem converter):
${l || "(nenhum)"}

Retorne JSON ESTRITO:
{
  "winning_patterns": ["padrão curto 1", "padrão curto 2", ...],   // máx 5, ex: "títulos com número específico", "menciona CPFL", "tom de pergunta"
  "losing_patterns": ["padrão a evitar 1", ...],                    // máx 5
  "best_image_traits": ["traço visual 1", ...],                     // máx 3 (deduzido do contexto)
  "summary": "1 frase curta com a principal lição da semana"
}`;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content;
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function processConsultant(supabase: ReturnType<typeof adminClient>, consultantId: string) {
  // Junta métricas dos últimos 30 dias por ad
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { data: campaigns } = await supabase
    .from("facebook_campaigns")
    .select("id, distribuidora, fb_ad_ids, creative_pack_id")
    .eq("consultant_id", consultantId);

  if (!campaigns || campaigns.length === 0) return { updated: 0 };

  const rows: AdRow[] = [];
  for (const camp of campaigns) {
    const adIds: string[] = Array.isArray(camp.fb_ad_ids) ? camp.fb_ad_ids as string[] : [];
    if (adIds.length === 0) continue;
    // métricas agregadas da campanha (por enquanto não há per-ad granular salvo)
    const { data: ms } = await supabase
      .from("facebook_metrics_daily")
      .select("spend_cents, impressions, clicks, leads, complete_registrations")
      .eq("campaign_id", camp.id)
      .gte("date", since);
    const tot = (ms || []).reduce(
      (acc, m: any) => ({
        spend_cents: acc.spend_cents + (m.spend_cents || 0),
        impressions: acc.impressions + (m.impressions || 0),
        clicks: acc.clicks + (m.clicks || 0),
        leads: acc.leads + (m.leads || 0),
        registrations: acc.registrations + (m.complete_registrations || 0),
      }),
      { spend_cents: 0, impressions: 0, clicks: 0, leads: 0, registrations: 0 }
    );
    if (tot.impressions < 100) continue; // amostra muito pequena

    // pega copy do creative_pack
    let copyVariations: { text: string; framework: string }[] = [];
    if (camp.creative_pack_id) {
      const { data: pack } = await supabase
        .from("facebook_creative_packs")
        .select("copy_pack, generated_variants")
        .eq("id", camp.creative_pack_id)
        .maybeSingle();
      const variants = (pack?.generated_variants as any)?.headlines || [];
      copyVariations = Array.isArray(variants) ? variants : [];
    }

    // distribui métricas total entre ads (proxy: igual)
    const perAd = adIds.length;
    for (let i = 0; i < adIds.length; i++) {
      const cv = copyVariations[i % Math.max(copyVariations.length, 1)];
      rows.push({
        id: crypto.randomUUID(),
        fb_ad_id: adIds[i],
        consultant_id: consultantId,
        campaign_id: camp.id,
        distribuidora: camp.distribuidora,
        headline: cv?.text || null,
        primary_text: null,
        framework: cv?.framework || null,
        impressions: Math.floor(tot.impressions / perAd),
        clicks: Math.floor(tot.clicks / perAd),
        leads: Math.floor(tot.leads / perAd),
        registrations: Math.floor(tot.registrations / perAd),
        spend_cents: Math.floor(tot.spend_cents / perAd),
        score: 0,
      });
    }
  }

  rows.forEach(r => { r.score = scoreOf(r); });
  rows.sort((a, b) => b.score - a.score);

  const winners = rows.filter(r => r.score > 0).slice(0, 5);
  const losers = rows.filter(r => r.spend_cents > 500 && r.leads === 0).slice(-5);

  // Upsert performance per ad
  for (const r of rows) {
    await supabase.from("ad_creative_performance").upsert({
      consultant_id: r.consultant_id,
      campaign_id: r.campaign_id,
      fb_ad_id: r.fb_ad_id,
      headline: r.headline,
      primary_text: r.primary_text,
      framework: r.framework,
      impressions: r.impressions,
      clicks: r.clicks,
      leads: r.leads,
      registrations: r.registrations,
      spend_cents: r.spend_cents,
      score: r.score,
      is_winner: winners.some(w => w.fb_ad_id === r.fb_ad_id),
      is_loser: losers.some(l => l.fb_ad_id === r.fb_ad_id),
      evaluated_at: new Date().toISOString(),
    }, { onConflict: "fb_ad_id" });
  }

  // Padrões via IA
  const insights = await summarizeWithAI({ winners, losers }) || {
    winning_patterns: winners.map(w => w.framework).filter(Boolean) as string[],
    losing_patterns: [],
    best_image_traits: [],
    summary: "Aprendizado em construção. Roda mais alguns dias.",
  };

  const bestCtr = rows.length ? Math.max(...rows.map(r => r.impressions > 0 ? Math.round(r.clicks * 10000 / r.impressions) : 0)) : 0;
  const bestCpa = winners.find(w => w.registrations > 0);

  // Por distribuidora (agrupa)
  const distribs = Array.from(new Set(rows.map(r => r.distribuidora || ""))).filter(Boolean);
  for (const d of distribs.length ? distribs : [null]) {
    await supabase.from("ad_creative_insights").upsert({
      consultant_id: consultantId,
      distribuidora: d,
      winning_patterns: insights.winning_patterns,
      losing_patterns: insights.losing_patterns,
      best_image_traits: insights.best_image_traits,
      best_ctr_bps: bestCtr,
      best_cpa_cents: bestCpa ? Math.round(bestCpa.spend_cents / bestCpa.registrations) : null,
      sample_size: rows.length,
      summary: insights.summary,
      updated_at: new Date().toISOString(),
    }, { onConflict: "consultant_id,distribuidora" });
  }

  // Recomendações pró-ativas (1 por dia, deduplicada por título)
  if (insights.winning_patterns.length > 0) {
    const top = insights.winning_patterns[0];
    const title = `Padrão vencedor: ${top}`;
    const { data: existing } = await supabase
      .from("ad_recommendations")
      .select("id")
      .eq("consultant_id", consultantId)
      .eq("title", title)
      .is("dismissed_at", null)
      .is("applied_at", null)
      .limit(1);
    if (!existing || existing.length === 0) {
      await supabase.from("ad_recommendations").insert({
        consultant_id: consultantId,
        type: "winning_pattern",
        title,
        message: insights.summary,
        severity: "success",
        action_label: "Aplicar nas próximas campanhas",
        action_payload: { pattern: top, kind: "winning" },
      });
    }
  }
  if (losers.length >= 3) {
    const title = "Anúncios fracos detectados";
    const { data: existing } = await supabase
      .from("ad_recommendations")
      .select("id").eq("consultant_id", consultantId).eq("title", title)
      .is("dismissed_at", null).is("applied_at", null).limit(1);
    if (!existing || existing.length === 0) {
      await supabase.from("ad_recommendations").insert({
        consultant_id: consultantId,
        type: "losers_detected",
        title,
        message: `${losers.length} anúncios estão gastando sem trazer conversa. Vamos pausá-los na próxima rodada (12h).`,
        severity: "warning",
      });
    }
  }

  return { updated: rows.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = adminClient();
    // Lista consultores ativos com campanhas
    const { data: consultants } = await supabase
      .from("facebook_campaigns")
      .select("consultant_id")
      .neq("status", "draft");
    const ids = Array.from(new Set((consultants || []).map((c: any) => c.consultant_id))).filter(Boolean);

    let totalUpdated = 0;
    for (const id of ids) {
      try {
        const r = await processConsultant(supabase, id);
        totalUpdated += r.updated;
      } catch (e) {
        console.error("learner consultor", id, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, consultants: ids.length, ads_evaluated: totalUpdated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
