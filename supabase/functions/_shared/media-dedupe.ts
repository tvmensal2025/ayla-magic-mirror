// Helper to enforce: same audio/video media is NEVER sent twice to the same customer.
// Wraps the try_log_media_send RPC.

export async function canSendMediaOnce(
  supabase: any,
  opts: {
    consultantId?: string | null;
    customerId?: string | null;
    mediaId?: string | null;
    slotKey?: string | null;
    kind: string;
  },
): Promise<boolean> {
  const k = (opts.kind || "").toLowerCase();
  // Regra aplica apenas para áudio e vídeo (imagens/documentos podem repetir).
  if (k !== "audio" && k !== "video") return true;
  if (!opts.customerId || !opts.mediaId) return true; // sem id não há como deduplicar
  try {
    const { data, error } = await supabase.rpc("try_log_media_send", {
      _consultant_id: opts.consultantId || null,
      _customer_id: opts.customerId,
      _media_id: opts.mediaId,
      _slot_key: opts.slotKey || null,
      _kind: k,
    });
    if (error) {
      console.warn("[media-dedupe] RPC error:", error.message);
      return true; // best-effort: na dúvida, envia
    }
    if (data === false) {
      console.log(`[media-dedupe] ⏭️ pulando ${k} já enviado (media_id=${opts.mediaId}) customer=${opts.customerId}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[media-dedupe] failed:", (e as any)?.message);
    return true;
  }
}
