// Gera imagem de FUNDO (sem texto) para criativo iGreen via Lovable AI Gateway.
// Texto/headline/selo são aplicados depois como overlay determinístico no client
// (CreativeOverlay) — assim NUNCA temos erro de português ou letra deformada.
// Loop de QA visual: até 3 tentativas, regenera se vier texto/painel/deformação.

import { adminClient, authConsultant, corsHeaders } from "../_shared/fb-graph.ts";
import { uploadToMinioPath } from "../_shared/minio-upload.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Format = "feed_1x1" | "story_9x16" | "reels_9x16" | "carousel_4x5";

const FORMAT_SPEC: Record<Format, { ratio: string; w: number; h: number; safeZone: string; placement: string }> = {
  feed_1x1:     { ratio: "1:1",  w: 1080, h: 1080, safeZone: "deixe um terço SUPERIOR da imagem com fundo limpo/desfocado para receber texto sobreposto",          placement: "Feed FB/IG" },
  story_9x16:   { ratio: "9:16", w: 1080, h: 1920, safeZone: "deixe o terço SUPERIOR e o terço INFERIOR com fundo limpo/desfocado para receber texto e CTA",       placement: "Stories" },
  reels_9x16:   { ratio: "9:16", w: 1080, h: 1920, safeZone: "deixe o terço SUPERIOR com fundo limpo/desfocado para receber a headline",                            placement: "Reels" },
  carousel_4x5: { ratio: "4:5",  w: 1080, h: 1350, safeZone: "deixe o terço SUPERIOR com fundo limpo/desfocado para receber a headline",                            placement: "Carrossel feed" },
};

const ANGLE_DESC: Record<string, string> = {
  economia_concreta: "pessoa real brasileira em casa simples sorrindo aliviada segurando uma conta de energia, iluminação natural quente, expressão de alívio financeiro",
  quebra_objecao:    "close em mãos brasileiras segurando smartphone com app de energia aberto (interface borrada/genérica, SEM texto legível), em ambiente residencial brasileiro",
  prova_social:      "família brasileira de classe média (pai, mãe, filho) sorrindo na sala de casa simples, autêntica, não-posada, iluminação natural",
  curiosidade:       "pessoa brasileira em cozinha simples olhando para conta de luz com expressão de surpresa e dúvida, fundo desfocado",
  dor_pas:           "pessoa brasileira preocupada na sala de casa olhando uma conta de luz alta, luz fria desbotada (clima de problema), fundo simples",
  urgencia_local:    "vista de bairro residencial brasileiro de classe média ao entardecer, casas simples, postes, atmosfera regional",
};

const ANGLE_HEADLINE: Record<string, { headline: string; badge: string }> = {
  economia_concreta: { headline: "Conta de luz até 20% mais barata", badge: "ATÉ 20% OFF" },
  quebra_objecao:    { headline: "Sem painel. Sem obra. Sem fidelidade.", badge: "0 OBRA" },
  prova_social:      { headline: "Milhares de famílias já pagam menos", badge: "+ DE 10 MIL" },
  curiosidade:       { headline: "Por que sua conta de luz veio tão alta?", badge: "DESCUBRA" },
  dor_pas:           { headline: "Cansado de pagar caro na conta de luz?", badge: "RESOLVA HOJE" },
  urgencia_local:    { headline: "Disponível agora na sua cidade", badge: "ÚLTIMAS VAGAS" },
};

const PRIMARY_MODEL = "google/gemini-3.1-flash-image-preview"; // Nano Banana 2
const FALLBACK_MODEL = "google/gemini-2.5-flash-image";

async function generateImage(prompt: string, model: string): Promise<string | null> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`[image-gen] ${model} → ${res.status}: ${txt.slice(0, 200)}`);
    return null;
  }
  const data = await res.json();
  const url = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  return typeof url === "string" ? url : null;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("data URL inválida");
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

async function runQa(imageUrl: string): Promise<{ approved: boolean; report: any }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ad-creative-qa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({ image_url: imageUrl }),
    });
    const report = await res.json();
    return { approved: report.approved !== false, report };
  } catch (e) {
    console.error("[qa] failed, fail-open", e);
    return { approved: true, report: { error: String(e) } };
  }
}

function buildPrompt(angle: string, format: Format, distribuidora: string): string {
  const spec = FORMAT_SPEC[format];
  const scene = ANGLE_DESC[angle] || ANGLE_DESC.economia_concreta;

  return `PHOTOREALISTIC ADVERTISING BACKGROUND PHOTO (no text overlay yet — text will be added later).

═══ ABSOLUTE RULE — NO TEXT, EVER ═══
The image MUST NOT contain ANY:
- letters, words, numbers, characters, punctuation
- written signs, billboards, posters, captions, watermarks, subtitles
- legible text on bills, papers, screens, phones, packaging, t-shirts, walls, license plates
- logos with text, brand names, UI elements with labels
- typography, infographics, charts with numbers
If a paper or bill is visible, it MUST be blurred or angled so NO text is readable. Phone screens MUST be blurred or off. This is non-negotiable — any visible character makes the image USELESS.

═══ FORMAT ═══
Aspect ratio: ${spec.ratio} (${spec.w}x${spec.h})
Placement: ${spec.placement}
Composition: ${spec.safeZone}. The main subject should sit on the OPPOSITE third (so the clean third can hold sobreposed text later).

═══ SCENE ═══
${scene}

═══ STYLE ═══
- Photoreal Brazilian DSLR photography, NOT illustration, NOT 3D render, NOT cartoon
- Natural warm sunlight, golden hour or soft window light
- Authentic Brazilian middle/lower-middle-class home (NOT American suburb, NOT Scandinavian, NOT studio)
- Real-looking person (not model-tier beauty), Brazilian features, authentic clothes
- Subtle green color accent in environment if natural (a plant, a green object) — NOT forced overlay
- Region context: ${distribuidora}

═══ ABSOLUTELY FORBIDDEN ═══
- Solar panels on roof or anywhere (iGreen does NOT install panels)
- American/European/Asian stock-photo aesthetic
- Studio backdrop or fake gradient background
- Cartoon, 3D render, illustration, AI-art look
- Multiple disconnected scenes / collage
- Hands or fingers with extra/missing digits
- Floating UI elements, badges, percentage signs, currency symbols

Output: ONE single PNG, photographic, ad-ready, NO TEXT.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await authConsultant(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const format: Format = ["feed_1x1", "story_9x16", "reels_9x16", "carousel_4x5"].includes(body?.format)
      ? body.format : "feed_1x1";
    const requestedAngle: string | undefined = body?.angle;
    const isPublic: boolean = !!body?.is_public;
    const customHeadline: string | undefined = body?.custom_headline;
    const customBadge: string | undefined = body?.custom_badge;

    const admin = adminClient();

    const { data: settings } = await admin
      .from("consultant_ad_settings")
      .select("distribuidora_default, cities, display_name")
      .eq("consultant_id", auth.id)
      .maybeSingle();

    const { data: insights } = await admin
      .from("ad_creative_insights")
      .select("winning_patterns, distribuidora")
      .eq("consultant_id", auth.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const distribuidora = settings?.distribuidora_default || insights?.distribuidora || "Brasil";
    const angle = requestedAngle
      || (Array.isArray(insights?.winning_patterns) && (insights!.winning_patterns[0] as any)?.angle)
      || "economia_concreta";

    const prompt = buildPrompt(angle, format, distribuidora);
    const spec = FORMAT_SPEC[format];

    // Loop de QA: até 3 tentativas
    let imageDataUrl: string | null = null;
    let lastReport: any = null;
    let attempts = 0;
    let modelUsed = PRIMARY_MODEL;

    for (attempts = 1; attempts <= 3; attempts++) {
      const useModel = attempts === 1 ? PRIMARY_MODEL : (attempts === 2 ? PRIMARY_MODEL : FALLBACK_MODEL);
      modelUsed = useModel;
      const candidate = await generateImage(prompt, useModel);
      if (!candidate) { lastReport = { error: `model_${useModel}_returned_null` }; continue; }

      // Sobe pra MinIO temporário só pra QA conseguir baixar
      const { bytes, mime } = dataUrlToBytes(candidate);
      const ext = mime.includes("png") ? "png" : "jpg";
      const tmpKey = `creativos/${auth.id}/_tmp/${Date.now()}_a${attempts}.${ext}`;
      let tmpUrl: string;
      try {
        const up = await uploadToMinioPath(bytes, mime, tmpKey);
        tmpUrl = up.url;
      } catch {
        // fallback supabase
        const path = `creatives/${auth.id}/_tmp/${Date.now()}.${ext}`;
        await admin.storage.from("IMAGE").upload(path, bytes, { contentType: mime, upsert: true });
        tmpUrl = admin.storage.from("IMAGE").getPublicUrl(path).data.publicUrl;
      }

      const qa = await runQa(tmpUrl);
      lastReport = qa.report;
      console.log(`[gen] attempt ${attempts} (${useModel}) qa=`, qa);

      if (qa.approved) {
        imageDataUrl = candidate;
        break;
      }
    }

    if (!imageDataUrl) {
      return new Response(JSON.stringify({
        error: "Não consegui gerar uma imagem aprovada (3 tentativas com texto/deformação detectados). Tente outro ângulo.",
        last_qa: lastReport,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Upload final
    const { bytes, mime } = dataUrlToBytes(imageDataUrl);
    const ext = mime.includes("png") ? "png" : mime.includes("jpeg") ? "jpg" : "png";
    const ts = Date.now();
    const dateSlug = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const objectKey = `creativos/${auth.id}/${dateSlug}_${angle}_${format}_${ts}.${ext}`;
    let imageUrl: string;
    let storagePath: string;
    try {
      const up = await uploadToMinioPath(bytes, mime, objectKey);
      imageUrl = up.url;
      storagePath = `minio:${up.bucket}/${up.objectKey}`;
    } catch (mErr) {
      const path = `creatives/${auth.id}/${format}-${ts}.${ext}`;
      const { error: upErr } = await admin.storage.from("IMAGE").upload(path, bytes, { contentType: mime, upsert: false });
      if (upErr) throw new Error(`Upload falhou: ${(mErr as Error).message} / ${upErr.message}`);
      imageUrl = admin.storage.from("IMAGE").getPublicUrl(path).data.publicUrl;
      storagePath = path;
    }

    // Headline/badge: cliente pode customizar; senão usamos a sugestão por ângulo
    const headline = customHeadline || ANGLE_HEADLINE[angle]?.headline || ANGLE_HEADLINE.economia_concreta.headline;
    const badge = customBadge || ANGLE_HEADLINE[angle]?.badge || ANGLE_HEADLINE.economia_concreta.badge;

    // Layout do overlay (posições por formato)
    const overlay_layout = {
      headline_position: format === "story_9x16" ? "top" : "top",
      badge_position: format === "story_9x16" ? "bottom_right" : "top_right",
      brand_position: "bottom_left",
      version: 1,
    };

    const { data: row, error: insErr } = await admin
      .from("ad_generated_creatives")
      .insert({
        consultant_id: auth.id,
        format,
        image_url: imageUrl,
        storage_path: storagePath,
        prompt_used: prompt.slice(0, 4000),
        brief_used: ANGLE_DESC[angle] || null,
        angle,
        is_public: isPublic,
        headline_used: headline,
        badge_text: badge,
        overlay_layout,
        qa_report: lastReport,
        qa_attempts: attempts,
        inspired_by_advertisers: [],
      })
      .select()
      .single();
    if (insErr) console.error("[image-generator] insert error", insErr);

    return new Response(JSON.stringify({
      ok: true,
      id: row?.id,
      image_url: imageUrl,
      format,
      angle,
      headline,
      badge,
      overlay_layout,
      qa_attempts: attempts,
      model_used: modelUsed,
      width: spec.w,
      height: spec.h,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[image-generator] error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
