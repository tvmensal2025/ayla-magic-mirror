// Bot Health Intel — IA Gemini analisa últimos 7 dias do consultor:
// texto, áudio, vídeo, imagem, transições, handoffs, A/B/C e gera
// diagnóstico acionável para converter mais.
//
// Persiste em capture_diagnostics (scope='bot_health', consultant_id).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const MODEL_PRIMARY = "google/gemini-2.5-pro";
const MODEL_FALLBACK = "google/gemini-3-flash-preview";

function truncate(s: string | null | undefined, n = 280): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function collect(sb: any, consultantId: string) {
  const sinceIso = new Date(Date.now() - 7 * 86400_000).toISOString();

  // customers do consultor (apenas leads de WhatsApp, não sync iGreen)
  const { data: custs } = await sb
    .from("customers")
    .select("id, status, conversation_step, flow_variant, last_step_advanced_at, created_at, bot_paused")
    .eq("consultant_id", consultantId)
    .neq("customer_origin", "igreen_sync")
    .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString())
    .limit(2000);
  const customers = custs || [];
  const customerIds = customers.map((c: any) => c.id);

  // conversations 7d
  let convs: any[] = [];
  if (customerIds.length) {
    const { data } = await sb
      .from("conversations")
      .select("customer_id, message_direction, message_text, message_type, conversation_step, slot_key, created_at")
      .in("customer_id", customerIds)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(3000);
    convs = data || [];
  }

  // transições
  const { data: transRaw } = await sb
    .from("bot_step_transitions")
    .select("from_step, to_step, intent, confidence, duration_ms, created_at")
    .eq("consultant_id", consultantId)
    .gte("created_at", sinceIso)
    .limit(1500);
  const transitions = transRaw || [];

  // handoffs
  const { data: handoffRaw } = await sb
    .from("bot_handoff_alerts")
    .select("reason, user_message, created_at, resolved_at")
    .eq("consultant_id", consultantId)
    .gte("created_at", sinceIso)
    .limit(300);
  const handoffs = handoffRaw || [];

  // === Agregações ===
  const mediaCounts: Record<string, { in: number; out: number }> = {};
  const stepCounts: Record<string, number> = {};
  const inboundSamples: { text: string; step: string | null; type: string }[] = [];
  const outboundSamples: { text: string; step: string | null; type: string }[] = [];
  for (const c of convs) {
    const t = c.message_type || "text";
    if (!mediaCounts[t]) mediaCounts[t] = { in: 0, out: 0 };
    if (c.message_direction === "inbound") mediaCounts[t].in++;
    else mediaCounts[t].out++;
    if (c.conversation_step) stepCounts[c.conversation_step] = (stepCounts[c.conversation_step] || 0) + 1;
    if (c.message_direction === "inbound" && c.message_text && inboundSamples.length < 30) {
      inboundSamples.push({ text: truncate(c.message_text), step: c.conversation_step, type: t });
    }
    if (c.message_direction === "outbound" && c.message_text && outboundSamples.length < 20) {
      outboundSamples.push({ text: truncate(c.message_text, 200), step: c.conversation_step, type: t });
    }
  }

  const handoffReasons: Record<string, number> = {};
  const handoffSamples: string[] = [];
  for (const h of handoffs) {
    handoffReasons[h.reason || "unknown"] = (handoffReasons[h.reason || "unknown"] || 0) + 1;
    if (h.user_message && handoffSamples.length < 10) handoffSamples.push(truncate(h.user_message, 160));
  }

  // transições — confiança média e contagem por destino
  const transAgg: Record<string, { count: number; confSum: number; confN: number; intents: Record<string, number> }> = {};
  for (const t of transitions) {
    const k = `${t.from_step || "?"} → ${t.to_step || "?"}`;
    if (!transAgg[k]) transAgg[k] = { count: 0, confSum: 0, confN: 0, intents: {} };
    transAgg[k].count++;
    if (t.confidence != null) { transAgg[k].confSum += Number(t.confidence); transAgg[k].confN++; }
    if (t.intent) transAgg[k].intents[t.intent] = (transAgg[k].intents[t.intent] || 0) + 1;
  }
  const topTransitions = Object.entries(transAgg)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([k, v]) => ({
      path: k,
      count: v.count,
      avg_confidence: v.confN ? Math.round((v.confSum / v.confN) * 100) / 100 : null,
      top_intent: Object.entries(v.intents).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    }));

  // leads parados por passo
  const cutoff24 = Date.now() - 24 * 3600_000;
  const stuckByStep: Record<string, number> = {};
  for (const c of customers) {
    if (c.bot_paused) continue;
    if (!c.conversation_step) continue;
    const t = c.last_step_advanced_at ? new Date(c.last_step_advanced_at).getTime() : null;
    if (t && t < cutoff24) {
      stuckByStep[c.conversation_step] = (stuckByStep[c.conversation_step] || 0) + 1;
    }
  }

  // A/B/C: total e aprovados por variante (7d)
  const since7Ms = Date.now() - 7 * 86400_000;
  const variants: Record<string, { total: number; approved: number }> = {};
  for (const c of customers) {
    if (new Date(c.created_at).getTime() < since7Ms) continue;
    const v = c.flow_variant || "A";
    if (!variants[v]) variants[v] = { total: 0, approved: 0 };
    variants[v].total++;
    if (c.status === "approved") variants[v].approved++;
  }

  // contexto de anúncios (global — todos compartilham)
  const [insightsRes, competitorRes] = await Promise.all([
    sb.from("ad_creative_insights").select("winning_patterns, losing_patterns, best_image_traits, summary").order("updated_at", { ascending: false }).limit(5),
    sb.from("ad_competitor_creatives").select("advertiser, headline, angle, creative_format, active_days").order("active_days", { ascending: false }).limit(8),
  ]);

  return {
    sinceIso,
    counts: {
      leads_7d: customers.filter((c: any) => new Date(c.created_at).getTime() >= since7Ms).length,
      leads_30d: customers.length,
      conversations: convs.length,
      transitions: transitions.length,
      handoffs: handoffs.length,
    },
    mediaCounts,
    stepCounts,
    inboundSamples,
    outboundSamples,
    handoffReasons,
    handoffSamples,
    topTransitions,
    stuckByStep,
    variants,
    adInsights: insightsRes.data || [],
    competitors: competitorRes.data || [],
  };
}

function buildPrompt(data: any): string {
  return `Você é o melhor analista de conversão WhatsApp do Brasil para venda de energia solar por assinatura (iGreen).
Analise TUDO que aconteceu nos últimos 7 dias com este consultor e gere um diagnóstico INCRÍVEL, específico e acionável para CONVERTER MAIS leads. Pense como um consultor sênior olhando todas as conversas, áudios, vídeos, imagens enviadas e respostas dos leads.

# Volume (7d)
${JSON.stringify(data.counts, null, 2)}

# Mensagens por tipo (text/audio/video/image) - inbound vs outbound
${JSON.stringify(data.mediaCounts, null, 2)}

# Distribuição de mensagens por passo do fluxo
${JSON.stringify(data.stepCounts, null, 2)}

# Amostras de mensagens recebidas dos leads (o que eles realmente dizem)
${JSON.stringify(data.inboundSamples, null, 2)}

# Amostras de mensagens enviadas pelo bot
${JSON.stringify(data.outboundSamples, null, 2)}

# Transições de passo com confiança da IA (≤0.5 = IA insegura)
${JSON.stringify(data.topTransitions, null, 2)}

# Handoffs (bot pediu humano) - contagem por motivo
${JSON.stringify(data.handoffReasons, null, 2)}

# Frases que o bot não soube responder
${JSON.stringify(data.handoffSamples, null, 2)}

# Leads parados >24h por passo
${JSON.stringify(data.stuckByStep, null, 2)}

# A/B/C (A=áudio, B=sem áudio, C=vídeo) — 7d, total e aprovados
${JSON.stringify(data.variants, null, 2)}

# Insights de anúncios que estão convertendo (contexto LP→WhatsApp)
${JSON.stringify(data.adInsights, null, 2)}

# Anúncios de concorrentes mais duradouros
${JSON.stringify(data.competitors, null, 2)}

Retorne EXCLUSIVAMENTE JSON válido:
{
  "summary": "Frase punchy ≤140 chars com o diagnóstico mais importante para converter mais",
  "health_score": 0-100,
  "bottlenecks": [{ "title": "...", "detail": "cite números reais", "step": "passo_afetado_ou_null", "severity": "high|medium|low" }],
  "winners": [{ "title": "...", "detail": "o que está funcionando bem" }],
  "lead_drops": [{ "step": "passo", "stuck_count": 0, "why": "hipótese baseada nas mensagens", "fix": "ação concreta" }],
  "media_insights": [{ "type": "audio|video|image|text", "observation": "...", "action": "..." }],
  "ab_recommendation": { "best_variant": "A|B|C", "why": "...", "action": "pause_loser|expand_winner|keep_testing" },
  "actions": [{ "label": "≤30 chars (botão)", "detail": "...", "impact": "high|medium|low", "type": "tune_flow|fix_handoff|change_media|adjust_copy|pause_variant|expand_variant|reactivate_leads|other" }]
}

Regras:
- Máximo 6 itens por lista, mínimo 1 quando possível
- SEMPRE cite números/percentuais reais dos dados acima
- Foque em CONVERTER MAIS, não em métricas vaidade
- Se áudio (variante A) converte mais que texto (B), DIGA
- Se um passo tem muitos leads parados E baixa confiança da IA, é gargalo CRÍTICO
- Linguagem direta, brasileira, sem jargão corporativo`;
}

async function callGemini(prompt: string, model: string): Promise<any> {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Lovable-API-Key": LOVABLE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Você responde EXCLUSIVAMENTE com JSON válido, sem markdown, sem ```json." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`gateway ${res.status}: ${t}`);
  }
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content ?? "";
  // limpa markdown defensivo
  const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(clean);
}

async function runFor(consultantId: string) {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const data = await collect(sb, consultantId);

  if (data.counts.conversations < 10) {
    const out = {
      summary: "Poucos dados ainda — rode mais leads para a IA analisar.",
      health_score: 0,
      bottlenecks: [],
      winners: [],
      lead_drops: [],
      media_insights: [],
      ab_recommendation: null,
      actions: [{ label: "Gerar mais tráfego", detail: `Apenas ${data.counts.conversations} mensagens em 7d. Mínimo: 10.`, impact: "high", type: "other" }],
    };
    await sb.from("capture_diagnostics").insert({
      scope: "bot_health",
      consultant_id: consultantId,
      kpis: data.counts,
      bottlenecks: [], winners: [], actions: out.actions,
      summary: out.summary, sample_size: data.counts.conversations, model_used: "skip_low_sample",
    });
    return { ok: true, skipped: true, ...out };
  }

  const prompt = buildPrompt(data);
  let aiOut: any = null;
  let modelUsed = MODEL_PRIMARY;
  try {
    aiOut = await callGemini(prompt, MODEL_PRIMARY);
  } catch (e) {
    console.warn("[bot-health-intel] primary failed:", String(e));
    try {
      aiOut = await callGemini(prompt, MODEL_FALLBACK);
      modelUsed = MODEL_FALLBACK;
    } catch (e2) {
      console.error("[bot-health-intel] fallback failed:", String(e2));
      throw e2;
    }
  }

  const kpis = {
    ...data.counts,
    health_score: aiOut.health_score ?? null,
    media: data.mediaCounts,
    variants: data.variants,
    handoff_reasons: data.handoffReasons,
    stuck_by_step: data.stuckByStep,
  };

  const { error } = await sb.from("capture_diagnostics").insert({
    scope: "bot_health",
    consultant_id: consultantId,
    kpis,
    bottlenecks: aiOut.bottlenecks || [],
    winners: aiOut.winners || [],
    actions: aiOut.actions || [],
    summary: aiOut.summary || null,
    sample_size: data.counts.conversations,
    model_used: modelUsed,
  });
  if (error) throw error;

  return { ok: true, model: modelUsed, sample: data.counts.conversations, ...aiOut, kpis };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    let consultantId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        consultantId = body?.consultant_id || null;
      } catch { /* ignore */ }
    }
    if (!consultantId) {
      // tenta extrair do JWT do caller
      const auth = req.headers.get("Authorization") || "";
      const token = auth.replace(/^Bearer\s+/i, "");
      if (token) {
        const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
        const { data } = await sb.auth.getUser(token);
        consultantId = data?.user?.id || null;
      }
    }
    if (!consultantId) {
      return new Response(JSON.stringify({ error: "consultant_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const out = await runFor(consultantId);
    return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[bot-health-intel] error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
