// QA visual de criativo gerado via Lovable AI Gateway (Gemini Flash com visão).
// Devolve flags objetivas pra decidir se a imagem é aprovada ou se regenera.

import { corsHeaders } from "../_shared/fb-graph.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type QaReport = {
  approved: boolean;
  has_text: boolean;
  has_panel: boolean;
  looks_stock: boolean;
  has_deformed_face_or_hand: boolean;
  notes?: string;
};

async function analyze(imageUrl: string): Promise<QaReport> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Você é auditor visual de anúncios. Responda APENAS chamando qa_report. Marque has_text=true SOMENTE se houver texto/letras GRANDES, LEGÍVEIS e em DESTAQUE ocupando área significativa da imagem (headlines, watermarks grandes, logos com nome, infográficos, selos com %). IGNORE texto pequeno/incidental/desfocado em props (folha de papel, calendário, conta de luz, embalagens, placas distantes, livros) — esses são naturais da cena e serão cobertos por overlay depois.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Audite esta imagem destinada a ser anúncio iGreen Energy no Meta Ads:" },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "qa_report",
            description: "Relatório de QA visual do criativo",
            parameters: {
              type: "object",
              properties: {
                has_text: { type: "boolean", description: "Há texto GRANDE e em DESTAQUE (headline, watermark grande, logo com nome, infográfico, selo com porcentagem) ocupando área significativa? IGNORAR texto pequeno em papel/calendário/conta nas mãos da pessoa." },
                has_panel: { type: "boolean", description: "Aparece painel solar fotovoltaico em telhado ou paisagem" },
                looks_stock: { type: "boolean", description: "Parece foto de banco de imagens americana/genérica (pessoas obviamente posadas, cenário não-brasileiro)" },
                has_deformed_face_or_hand: { type: "boolean", description: "Mão, dedo, rosto ou olho visivelmente deformado/anatomicamente errado" },
                notes: { type: "string", description: "1 frase curta explicando o que viu" },
              },
              required: ["has_text", "has_panel", "looks_stock", "has_deformed_face_or_hand"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "qa_report" } },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gateway QA ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("QA sem tool_call");
  const parsed = typeof args === "string" ? JSON.parse(args) : args;
  const approved = !parsed.has_text && !parsed.has_panel && !parsed.has_deformed_face_or_hand;
  return { approved, ...parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { image_url } = await req.json();
    if (!image_url) throw new Error("image_url ausente");
    const report = await analyze(image_url);
    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ad-creative-qa] error", err);
    return new Response(JSON.stringify({ error: (err as Error).message, approved: true }), {
      status: 200, // fail-open: se QA falhar, não bloqueia geração
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
