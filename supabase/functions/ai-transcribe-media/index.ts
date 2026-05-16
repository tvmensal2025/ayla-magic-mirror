// Transcreve áudios (e descreve imagens/vídeos quando aplicável) via Lovable AI Gateway.
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

function base64ToUint8Array(input: string) {
  const binary = atob(cleanBase64(input));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function extensionForMime(mimeType: string) {
  const mt = normalizeMimeType(mimeType);
  if (mt.includes("webm")) return "webm";
  if (mt.includes("mpeg") || mt.includes("mp3")) return "mp3";
  if (mt.includes("mp4") || mt.includes("m4a")) return "m4a";
  if (mt.includes("wav")) return "wav";
  if (mt.includes("ogg") || mt.includes("opus")) return "ogg";
  return "ogg";
}

async function transcribeAudioWithOpenAI(base64: string, mimeType: string, language: string) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return "";

  const normalizedMime = normalizeMimeType(mimeType).startsWith("audio/")
    ? normalizeMimeType(mimeType)
    : "audio/ogg";
  const bytes = base64ToUint8Array(base64);
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("language", language.toLowerCase().startsWith("pt") ? "pt" : language.slice(0, 2));
  form.append("response_format", "json");
  form.append("file", new File([bytes], `audio.${extensionForMime(normalizedMime)}`, { type: normalizedMime }));

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI transcription ${res.status}: ${JSON.stringify(payload).slice(0, 400)}`);
  return String(payload?.text || "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth: aceita JWT de usuário OU SERVICE_ROLE_KEY (chamadas internas: whapi-webhook, evolution-webhook, etc.)
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

    if (kind === "audio") {
      try {
        const transcript = await transcribeAudioWithOpenAI(normalizedBase64, normalizedMimeType, language);
        if (transcript) {
          console.log(`ai-transcribe-media: OpenAI transcreveu áudio (${transcript.length} chars)`);
          return new Response(JSON.stringify({ transcript }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (audioError: any) {
        console.warn("ai-transcribe-media OpenAI fallback to Gemini:", audioError?.message || audioError);
      }
    }

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