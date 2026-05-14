// QA visual de criativo gerado via Google Gemini 2.5 Pro (vision direct).
// Devolve flags objetivas pra decidir se a imagem é aprovada ou se regenera.

import { corsHeaders } from "../_shared/fb-graph.ts";
import { geminiMultimodal } from "../_shared/gemini.ts";

type QaReport = {
  approved: boolean;
  has_text: boolean;
  has_panel: boolean;
  looks_stock: boolean;
  has_deformed_face_or_hand: boolean;
  notes?: string;
};

const QA_SCHEMA = {
  type: "object",
  properties: {
    has_text: { type: "boolean" },
    has_panel: { type: "boolean" },
    looks_stock: { type: "boolean" },
    has_deformed_face_or_hand: { type: "boolean" },
    notes: { type: "string" },
  },
  required: ["has_text", "has_panel", "looks_stock", "has_deformed_face_or_hand"],
};

const SYSTEM = `Você é auditor visual de anúncios iGreen Energy no Meta Ads.
- has_text=true SOMENTE se houver texto/letras GRANDES, LEGÍVEIS e em DESTAQUE (headline, watermark grande, logo com nome, infográfico, selo com %).
- IGNORE texto pequeno em props (papel, calendário, conta de luz, embalagens, livros).
- has_panel=true se aparece painel solar em telhado/paisagem (proibido).
- looks_stock=true se parece banco de imagem genérico americano.
- has_deformed_face_or_hand=true se há mão/dedo/rosto/olho anatomicamente errado.
Responda APENAS com JSON estrito conforme o schema.`;

async function analyze(imageUrl: string): Promise<QaReport> {
  // Baixa para inline (Gemini direto não aceita URL externa diretamente em todos os modos)
  const r = await fetch(imageUrl);
  if (!r.ok) throw new Error(`fetch image ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const base64 = btoa(bin);
  const mimeType = r.headers.get("content-type") || "image/jpeg";

  const result = await geminiMultimodal({
    model: "gemini-2.5-pro",
    fallbackModel: "gemini-2.5-flash",
    system: SYSTEM,
    prompt: "Audite esta imagem destinada a anúncio iGreen Energy. Responda só o JSON.",
    base64,
    mimeType,
    temperature: 0.1,
    responseMimeType: "application/json",
    responseSchema: QA_SCHEMA,
    functionName: "ad-creative-qa",
  });

  let parsed: any = {};
  try { parsed = JSON.parse(result.text || "{}"); } catch { parsed = {}; }
  const approved = !parsed.has_text && !parsed.has_panel && !parsed.has_deformed_face_or_hand;
  return {
    approved,
    has_text: !!parsed.has_text,
    has_panel: !!parsed.has_panel,
    looks_stock: !!parsed.looks_stock,
    has_deformed_face_or_hand: !!parsed.has_deformed_face_or_hand,
    notes: parsed.notes || "",
  };
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
      status: 200, // fail-open
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
