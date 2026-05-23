import { supabase } from "@/integrations/supabase/client";

/** SHA-256 hex de um File/Blob, usando WebCrypto. */
export async function sha256File(file: File | Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export type ExistingMedia = {
  id: string;
  url: string | null;
  storage_path: string | null;
  duration_sec: number | null;
  original_size_bytes: number | null;
  final_size_bytes: number | null;
};

/** Procura uma mídia já enviada com o mesmo hash para o mesmo consultor. */
export async function findExistingByHash(
  consultantId: string,
  hash: string,
): Promise<ExistingMedia | null> {
  const { data, error } = await supabase
    .from("ai_media_library")
    .select("id, url, storage_path, duration_sec, original_size_bytes, final_size_bytes")
    .eq("consultant_id", consultantId)
    .eq("content_hash", hash)
    .not("url", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as ExistingMedia;
}
