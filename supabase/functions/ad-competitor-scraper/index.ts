// Pesquisa anúncios ativos de concorrentes na Biblioteca de Anúncios da Meta usando
// Gemini + Google Search grounding. Salva em ad_competitor_creatives para o builder
// e o learner usarem como referência. Idempotente por (advertiser, headline).
import { adminClient, corsHeaders } from "../_shared/fb-graph.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY");

const COMPETITORS = [
  "iGreen Energy", "Solfácil", "Lemon Energia", "Órigo Energia",
  "Setta Energia", "Bright Energia", "Genyx Energia",
  "Reverde Energia", "Alexandria Energia", "Matrix Energia",
];

interface CompetitorAd {
  advertiser: string;
  headline?: string;
  primary_text?: string;
  cta?: string;
  creative_format?: string; // estatico | video | carrossel
  angle?: string;           // economia_concreta | quebra_objecao | prova_social | curiosidade | dor_pas | urgencia_local
  active_days?: number;
}

async function research(advertiser: string): Promise<{ ads: CompetitorAd[]; debug: any }> {
  if (!GEMINI_KEY) return { ads: [], debug: { error: "no_gemini_key" } };
  const prompt = `Pesquise na Biblioteca de Anúncios do Facebook (https://www.facebook.com/ads/library/?country=BR) por "${advertiser}" — anúncios ATIVOS no Brasil agora.
Retorne JSON ESTRITO:

{
  "ads": [
    {
      "headline": "título exato do anúncio (ou primeiras palavras do texto)",
      "primary_text": "texto principal do anúncio (1-2 frases mais marcantes)",
      "cta": "Saiba mais | Enviar mensagem | Cadastre-se | etc",
      "creative_format": "estatico | video | carrossel",
      "angle": "economia_concreta | quebra_objecao | prova_social | curiosidade | dor_pas | urgencia_local",
      "active_days": número estimado de dias no ar
    }
  ]
}

Liste no MÁXIMO 5 anúncios — priorize os que estão há mais tempo no ar (sinal de conversão).
Se não encontrar ou não tiver certeza, retorne {"ads": []}. Não invente. Não inclua texto fora do JSON.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.2 },
        }),
      },
    );
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("\n") || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { ads: [], debug: { status: res.status, no_json: true, text_preview: text.slice(0, 300), data_preview: JSON.stringify(data).slice(0, 500) } };
    const parsed = JSON.parse(match[0]);
    const ads = (parsed.ads || [])
      .map((a: any) => ({
        advertiser,
        headline: String(a?.headline || "").slice(0, 200) || undefined,
        primary_text: String(a?.primary_text || "").slice(0, 600) || undefined,
        cta: String(a?.cta || "").slice(0, 60) || undefined,
        creative_format: ["estatico", "video", "carrossel"].includes(a?.creative_format) ? a.creative_format : undefined,
        angle: String(a?.angle || "").slice(0, 40) || undefined,
        active_days: Number.isFinite(a?.active_days) ? Math.max(0, Math.min(365, Math.floor(a.active_days))) : undefined,
      }))
      .filter((a: CompetitorAd) => a.headline || a.primary_text);
    return { ads, debug: { status: res.status, parsed_count: ads.length } };
  } catch (err) {
    return { ads: [], debug: { error: (err as Error).message } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    const all: CompetitorAd[] = [];
    const debugByAdv: Record<string, any> = {};
    for (const advertiser of COMPETITORS) {
      const { ads, debug } = await research(advertiser);
      debugByAdv[advertiser] = debug;
      console.log(`[scraper] ${advertiser}:`, JSON.stringify(debug));
      all.push(...ads);
      await new Promise((r) => setTimeout(r, 800));
    }

    let inserted = 0;
    for (const ad of all) {
      // Idempotência leve: chave estável por anunciante + headline
      const archive_id = `ai-${ad.advertiser}-${(ad.headline || "").slice(0, 40)}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");

      const { error } = await admin
        .from("ad_competitor_creatives")
        .upsert({
          advertiser: ad.advertiser,
          ad_archive_id: archive_id,
          headline: ad.headline,
          primary_text: ad.primary_text,
          cta: ad.cta,
          creative_format: ad.creative_format,
          angle: ad.angle,
          active_days: ad.active_days || 0,
          last_seen_at: new Date().toISOString(),
          ingested_at: new Date().toISOString(),
        }, { onConflict: "ad_archive_id" });
      if (!error) inserted++;
    }

    return new Response(
      JSON.stringify({ ok: true, advertisers: COMPETITORS.length, ads_found: all.length, upserted: inserted, debug: debugByAdv }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
