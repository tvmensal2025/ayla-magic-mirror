// Garante que uma mídia de áudio tenha transcript salvo.
// Usado pelo dispatcher na variante B (sem áudio) — o áudio vira mensagem
// de texto contendo a transcrição.

export interface AudioMediaRow {
  id?: string | null;
  url?: string | null;
  transcript?: string | null;
  kind?: string | null;
}

async function fetchAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch audio ${res.status}`);
  const mimeType = res.headers.get("content-type") || "audio/ogg";
  const buf = new Uint8Array(await res.arrayBuffer());
  // Encode em chunks para evitar stack overflow em áudios grandes
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return { base64: btoa(binary), mimeType };
}

export async function ensureAudioTranscript(
  supabase: any,
  media: AudioMediaRow,
): Promise<string> {
  const existing = (media?.transcript || "").trim();
  if (existing) return existing;
  if (!media?.url) return "";

  try {
    const { base64, mimeType } = await fetchAsBase64(media.url);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) {
      console.warn("[ensureAudioTranscript] missing SUPABASE_URL/SERVICE_ROLE_KEY");
      return "";
    }
    const res = await fetch(`${supabaseUrl}/functions/v1/ai-transcribe-media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ base64, mimeType, kind: "audio", language: "pt-BR" }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.warn(`[ensureAudioTranscript] transcribe ${res.status}: ${t.slice(0, 200)}`);
      return "";
    }
    const j = await res.json();
    const transcript = String(j?.transcript || "").trim();
    if (!transcript) return "";

    if (media.id) {
      try {
        await supabase
          .from("ai_media_library")
          .update({ transcript })
          .eq("id", media.id);
      } catch (e) {
        console.warn("[ensureAudioTranscript] save failed:", (e as Error)?.message || e);
      }
    }
    return transcript;
  } catch (e) {
    console.warn("[ensureAudioTranscript] error:", (e as Error)?.message || e);
    return "";
  }
}
