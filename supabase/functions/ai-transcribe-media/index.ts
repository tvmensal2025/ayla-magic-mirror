// Transcreve áudios (e descreve imagens/vídeos quando aplicável) via Gemini oficial.
// Body: { base64: string, mimeType: string, kind?: "audio"|"image"|"video"|"document", language?: string }
// Resp: { transcript: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiMultimodal } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function cleanBase64(input: string) {
  return String(input || "").replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
}

function normalizeMimeType(mimeType: string) {
  return String(mimeType || "application/octet-stream").split(";")[0].trim().toLowerCase() || "application/octet-stream";
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth: aceita JWT de usuário OU SERVICE_ROLE_KEY (chamadas internas)
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return new Response(JSON.stringify({ error: "no auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const isServiceCall = serviceKey && bearer === serviceKey;
    if (!isServiceCall) {
      const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await supabaseUser.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { base64, mimeType, kind = "audio", language = "pt-BR" } = await req.json();
    if (!base64 || !mimeType) {
      return new Response(JSON.stringify({ error: "base64 and mimeType required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const normalizedBase64 = cleanBase64(base64);
    const normalizedMimeType = normalizeMimeType(mimeType);

    const prompt = kind === "image"
      ? `Descreva detalhadamente o conteúdo desta imagem em ${language}. Se for uma conta de luz, RG, CNH ou documento, identifique o tipo. Seja conciso e factual.`
      : kind === "audio"
        ? `Transcreva literalmente este áudio em ${language}. Se houver fala baixa, curta ou ruído, tente mesmo assim. Retorne APENAS as palavras faladas, sem comentários.`
        : `Descreva o conteúdo deste arquivo em ${language}. Seja conciso.`;

    const result = await geminiMultimodal({
      prompt,
      base64: normalizedBase64,
      mimeType: normalizedMimeType,
      model: "gemini-2.5-flash",
      fallbackModel: "gemini-2.5-pro",
      functionName: "ai-transcribe-media",
    });
    const transcript = result.text;

    console.log(`ai-transcribe-media ok kind=${kind} mime=${normalizedMimeType} input_b64=${normalizedBase64.length} transcript_chars=${transcript.trim().length}`);

    return new Response(JSON.stringify({ transcript: transcript.trim() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("ai-transcribe-media error:", e);
    return new Response(JSON.stringify({ error: e?.message || "internal" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});