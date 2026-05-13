// Gera UMA imagem de criativo "perfeita" via Lovable AI Gateway (Nano Banana / google/gemini-2.5-flash-image).
// Combina: insights do consultor + top concorrentes (mais dias no ar) + brand voice iGreen + spec técnica do formato.
// Salva no bucket público "IMAGE" e registra em ad_generated_creatives.

import { adminClient, authConsultant, corsHeaders } from "../_shared/fb-graph.ts";
import { uploadToMinioPath } from "../_shared/minio-upload.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type Format = "feed_1x1" | "story_9x16" | "reels_9x16" | "carousel_4x5";

const FORMAT_SPEC: Record<Format, { ratio: string; w: number; h: number; safeArea: string; placement: string }> = {
  feed_1x1:     { ratio: "1:1",  w: 1080, h: 1080, safeArea: "centro com 80px de margem em cima/baixo (área segura para texto)", placement: "Feed do Facebook e Instagram" },
  story_9x16:   { ratio: "9:16", w: 1080, h: 1920, safeArea: "elemento principal entre 250px do topo e 250px do fim (evita logo IG e barra de ações)", placement: "Stories do Instagram e Facebook" },
  reels_9x16:   { ratio: "9:16", w: 1080, h: 1920, safeArea: "elemento principal entre 250px do topo e 350px do fim (evita CTA e legenda)", placement: "Reels do Instagram e Facebook" },
  carousel_4x5: { ratio: "4:5",  w: 1080, h: 1350, safeArea: "centro com 100px de margem", placement: "Carrossel do Feed" },
};

const ANGLE_DESC: Record<string, string> = {
  economia_concreta: "destacar economia em reais ou percentual de forma visível e crível",
  quebra_objecao:    "responder visualmente à dúvida 'mas como funciona sem painel no meu telhado?'",
  prova_social:      "mostrar gente real sorrindo segurando conta de luz / depoimento autêntico",
  curiosidade:       "criar tensão visual com pergunta ou comparação inesperada",
  dor_pas:           "mostrar a dor da conta de luz alta antes da solução",
  urgencia_local:    "destacar cidade/região e escassez (ex: 'últimas vagas em [cidade]')",
};

async function generateImage(prompt: string): Promise<{ dataUrl: string } | null> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gateway ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const url = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url || typeof url !== "string") return null;
  return { dataUrl: url };
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("data URL inválida");
  const mime = m[1];
  const b64 = m[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await authConsultant(req);
    if (!auth) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const format: Format = ["feed_1x1", "story_9x16", "reels_9x16", "carousel_4x5"].includes(body?.format) ? body.format : "feed_1x1";
    const requestedAngle: string | undefined = body?.angle;

    const admin = adminClient();

    // 1. Insights do consultor
    const { data: insights } = await admin
      .from("ad_creative_insights")
      .select("winning_patterns, losing_patterns, best_image_traits, best_image_briefs, summary, distribuidora")
      .eq("consultant_id", auth.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 2. Top concorrentes (mais dias no ar = sinal de conversão)
    const { data: competitors } = await admin
      .from("ad_competitor_creatives")
      .select("advertiser, headline, primary_text, angle, creative_format, active_days")
      .order("active_days", { ascending: false })
      .limit(8);

    // 3. Distribuidora / cidades do consultor
    const { data: settings } = await admin
      .from("consultant_ad_settings")
      .select("distribuidora_default, cities, display_name")
      .eq("consultant_id", auth.id)
      .maybeSingle();

    const distribuidora = settings?.distribuidora_default || insights?.distribuidora || "sua distribuidora";
    const cidades = Array.isArray(settings?.cities) ? settings!.cities.slice(0, 3).join(", ") : "";

    // 4. Escolher ângulo (parâmetro > vencedor histórico > default)
    const angle = requestedAngle || (Array.isArray(insights?.winning_patterns) && insights!.winning_patterns[0]?.angle) || "economia_concreta";
    const angleDesc = ANGLE_DESC[angle] || ANGLE_DESC.economia_concreta;

    const spec = FORMAT_SPEC[format];

    const winningStr = Array.isArray(insights?.winning_patterns) && insights!.winning_patterns.length
      ? insights!.winning_patterns.slice(0, 4).map((p: any) => `- ${typeof p === "string" ? p : p.pattern || JSON.stringify(p)}`).join("\n")
      : "- (sem dados próprios ainda — usar padrões do mercado)";
    const losingStr = Array.isArray(insights?.losing_patterns) && insights!.losing_patterns.length
      ? insights!.losing_patterns.slice(0, 3).map((p: any) => `- ${typeof p === "string" ? p : p.pattern || JSON.stringify(p)}`).join("\n")
      : "- imagens genéricas de painel solar em telhado de stock photo\n- pessoas claramente em foto de banco de imagens";

    const compStr = (competitors || []).slice(0, 5)
      .map((c) => `• [${c.advertiser} · ${c.active_days}d no ar · ${c.angle || "?"}] "${c.headline || ""}"`)
      .join("\n") || "(sem dados de concorrentes)";

    const prompt = `Crie um CRIATIVO DE ANÚNCIO REALISTA E IMPACTANTE para iGreen Energy (energia por assinatura, sem painel solar no telhado, desconto na conta de luz).

═══ FORMATO TÉCNICO OBRIGATÓRIO ═══
Aspect ratio: ${spec.ratio} (${spec.w}x${spec.h}px)
Posicionamento: ${spec.placement}
Área segura para texto/elemento principal: ${spec.safeArea}
NUNCA coloque texto ou rosto importante nas bordas extremas.

═══ ÂNGULO CRIATIVO ═══
${angle.toUpperCase()} → ${angleDesc}

═══ BRAND iGreen ═══
- Cor primária: verde vibrante #16a34a + verde escuro #15803d
- Energia limpa, brasileira, acessível, descomplicada
- Distribuidora alvo: ${distribuidora}${cidades ? ` | Cidades: ${cidades}` : ""}
- Tom: humano, próximo, otimista (NÃO corporativo frio)

═══ PADRÕES VENCEDORES (use como inspiração) ═══
${winningStr}

═══ EVITE A TODO CUSTO (perdedores) ═══
${losingStr}

═══ CONCORRENTES TOP (referência de estilo, NÃO copie literal) ═══
${compStr}

═══ COMPOSIÇÃO ═══
- Pessoa real brasileira (autêntica, não-modelo) sorrindo segurando uma conta de luz, OU close em mãos com calculadora e conta, OU casa simples brasileira com sobreposição numérica de economia
- Tipografia bold e legível mesmo em mobile, headline curta tipo "ATÉ 20% MENOS" ou "ECONOMIA NA HORA"
- Selo verde com R$ ou % de destaque
- Iluminação natural, cores quentes, alta saturação
- NÃO use painéis solares no telhado (a iGreen não instala painel)
- NÃO use stock photo genérico americano
- Logo discreto "iGreen" no canto

Gere uma única imagem PNG pronta para subir no Meta Ads, alta resolução, fotorealista misturado com elementos gráficos vetoriais sutis.`;

    const img = await generateImage(prompt);
    if (!img) return new Response(JSON.stringify({ error: "Imagem não gerada pelo modelo" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Upload no bucket IMAGE
    const { bytes, mime } = dataUrlToBytes(img.dataUrl);
    const ext = mime.includes("png") ? "png" : mime.includes("jpeg") ? "jpg" : "png";
    const path = `creatives/${auth.id}/${format}-${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage.from("IMAGE").upload(path, bytes, { contentType: mime, upsert: false });
    if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);
    const { data: pub } = admin.storage.from("IMAGE").getPublicUrl(path);
    const imageUrl = pub.publicUrl;

    // Registrar
    const { data: row, error: insErr } = await admin
      .from("ad_generated_creatives")
      .insert({
        consultant_id: auth.id,
        format,
        image_url: imageUrl,
        storage_path: path,
        prompt_used: prompt.slice(0, 4000),
        brief_used: angleDesc,
        angle,
        inspired_by_advertisers: (competitors || []).slice(0, 5).map((c) => c.advertiser),
      })
      .select()
      .single();
    if (insErr) console.error("[image-generator] insert error", insErr);

    return new Response(
      JSON.stringify({ ok: true, image_url: imageUrl, format, angle, id: row?.id, width: spec.w, height: spec.h }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[image-generator] error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
