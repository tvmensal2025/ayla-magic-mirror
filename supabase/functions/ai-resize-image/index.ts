// Reenquadra uma imagem no formato certo (1:1, 4:5, 9:16) usando Gemini 2.5 Flash Image.
// Mantém o sujeito principal centralizado, faz outpainting nas bordas se precisar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FORMATS: Record<string, { ratio: string; w: number; h: number; instruction: string }> = {
  square:   { ratio: "1:1",  w: 1080, h: 1080, instruction: "Reenquadre esta imagem em proporção QUADRADA 1:1 (1080x1080). Mantenha o sujeito principal centralizado. Faça outpainting nas bordas se precisar — não corte rostos, logos ou texto crítico." },
  vertical: { ratio: "4:5",  w: 1080, h: 1350, instruction: "Reenquadre esta imagem em proporção VERTICAL 4:5 (1080x1350). Mantenha o sujeito principal centralizado vertical e horizontalmente. Faça outpainting no topo e na base se precisar — não corte rostos." },
  story:    { ratio: "9:16", w: 1080, h: 1920, instruction: "Reenquadre esta imagem em proporção STORY VERTICAL 9:16 (1080x1920). Mantenha o sujeito principal entre 20% e 70% da altura para evitar a área coberta pelo CTA do Reels. Faça outpainting no topo e na base — não corte rostos nem logos." },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth) return json({ error: "no auth" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauth" }, 401);

    const { url, format } = await req.json();
    const spec = FORMATS[format];
    if (!url || !spec) return json({ error: "url and valid format required" }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    // Chama Gemini Image (nano banana) via Lovable Gateway
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        modalities: ["image", "text"],
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `${spec.instruction} Resultado deve ter exatamente ${spec.w}x${spec.h} pixels e proporção ${spec.ratio}. Não adicione texto novo, marca d'água ou bordas. Preserve cor, iluminação e detalhes do sujeito original.` },
            { type: "image_url", image_url: { url } },
          ],
        }],
      }),
    });
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return json({ error: "ai_failed", detail: txt.slice(0, 500) }, 502);
    }
    const aiData = await aiRes.json();
    const imgB64 = aiData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imgB64 || !imgB64.startsWith("data:image/")) {
      return json({ error: "no_image_returned", detail: JSON.stringify(aiData).slice(0, 500) }, 502);
    }

    // Decode base64 e faz upload pro bucket IMAGE
    const m = imgB64.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!m) return json({ error: "invalid base64" }, 502);
    const mime = m[1];
    const ext = mime === "image/png" ? "png" : "jpg";
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const path = `ai-resize/${user.id}/${Date.now()}-${format}.${ext}`;
    const { error: upErr } = await admin.storage.from("IMAGE").upload(path, bytes, {
      contentType: mime, upsert: true,
    });
    if (upErr) return json({ error: "upload_failed", detail: upErr.message }, 500);
    const { data: pub } = admin.storage.from("IMAGE").getPublicUrl(path);

    return json({ url: pub.publicUrl, format, mime });
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