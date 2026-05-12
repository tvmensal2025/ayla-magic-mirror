import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FORMAT_SPECS: Record<string, { ratio: string; safeArea: string }> = {
  square: { ratio: "1:1 (1080x1080)", safeArea: "Bordas externas: ~14% podem ser cortadas em alguns placements. Centralize tudo importante." },
  vertical: { ratio: "4:5 (1080x1350)", safeArea: "Mantenha CTA, rosto e logo dentro do retângulo central de 4:5 — bordas superior/inferior podem ser cortadas no Reels/Stories." },
  story: { ratio: "9:16 (1080x1920)", safeArea: "Topo 250px e rodapé 250px ficam cobertos por nome do criador, CTA e barra de progresso. Tudo crítico tem que ficar entre 14% e 80% da altura." },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth) return json({ error: "no auth" }, 401);

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauth" }, 401);

    const { url, format } = await req.json();
    if (!url || !format || !FORMAT_SPECS[format]) return json({ error: "url and format required" }, 400);

    // Cache lookup
    const { data: cached } = await supa.from("ad_image_validations")
      .select("validation").eq("image_url", url).eq("format", format).maybeSingle();
    if (cached?.validation) return json({ ...cached.validation, cached: true });

    const apiKey = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "no AI key" }, 500);

    const spec = FORMAT_SPECS[format];
    const prompt = `Você é especialista em Meta Ads. Analise esta imagem para um anúncio em formato ${spec.ratio}.

Regras de safe-area: ${spec.safeArea}
Regras Meta:
- Texto cobrindo mais de 20% da imagem reduz alcance.
- Rosto, CTA, logo e oferta devem estar dentro da safe-area.
- Imagem com baixa resolução, desfocada, com marca d'água ou logos de terceiros é reprovada.

Retorne APENAS JSON válido:
{
  "ok": boolean,
  "score": 0-100,
  "text_coverage_pct": number,
  "has_face": boolean,
  "face_in_safe_area": boolean,
  "issues": [{"type": "text_overflow|face_cropped|low_quality|logo_outside|no_focus", "severity": "warning|error", "suggestion": "string em PT-BR"}],
  "summary": "string curta em PT-BR"
}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url } },
          ],
        }],
        response_format: { type: "json_object" },
      }),
    });
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return json({ error: "ai_failed", detail: txt.slice(0, 500) }, 502);
    }
    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content || "{}";
    let validation: any;
    try { validation = JSON.parse(raw); }
    catch { validation = { ok: true, score: 70, summary: "IA não retornou JSON válido", issues: [] }; }

    await supa.from("ad_image_validations").upsert(
      { image_url: url, format, validation },
      { onConflict: "image_url,format" },
    );

    return json({ ...validation, cached: false });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}