import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("Media Upload");

export interface UploadResult {
  url: string;
  key: string;
  type: string;
  size: number;
  storage?: "minio" | "supabase";
}

export interface UploadContext {
  /** chat | template | avatar | admin | generic */
  scope?: "chat" | "template" | "avatar" | "admin" | "generic";
  consultant_id?: string;
  /** WhatsApp JID/telefone do cliente (só dígitos ou já com @) */
  customer_jid?: string;
  customer_name?: string;
  /** Sub-pasta dentro do scope (ex: image/audio/video/document, ou nome do template) */
  kind?: string;
  /** Nome amigável para o arquivo */
  slug?: string;
}

/**
 * Upload a file to MinIO (with Supabase Storage fallback) via the upload-media edge function.
 * Returns the public URL of the uploaded file.
 */
export async function uploadMedia(
  file: File,
  onProgress?: (pct: number) => void,
  context?: UploadContext,
): Promise<UploadResult> {
  // Signal start
  onProgress?.(5);

  const formData = new FormData();
  formData.append("file", file);
  if (context) {
    if (context.scope) formData.append("scope", context.scope);
    if (context.consultant_id) formData.append("consultant_id", context.consultant_id);
    if (context.customer_jid) formData.append("customer_jid", context.customer_jid);
    if (context.customer_name) formData.append("customer_name", context.customer_name);
    if (context.kind) formData.append("kind", context.kind);
    if (context.slug) formData.append("slug", context.slug);
  }

  onProgress?.(15);

  const { data: { session } } = await supabase.auth.getSession();

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/upload-media`;

  onProgress?.(25);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: formData,
  });

  onProgress?.(85);

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    let errMsg = "Upload failed";
    try {
      const parsed = JSON.parse(errBody);
      errMsg = parsed.error || parsed.message || errMsg;
    } catch {
      if (errBody) errMsg = errBody;
    }
    logger.error("Erro:", res.status, errMsg);
    throw new Error(`Upload falhou (${res.status}): ${errMsg}`);
  }

  const result: UploadResult = await res.json();

  onProgress?.(100);

  return result;
}

/**
 * Get a user-friendly accept string for a file input based on media type.
 */
export function getAcceptString(mediaType: string): string {
  switch (mediaType) {
    case "image":
      return "image/jpeg,image/png,image/webp,image/gif";
    case "audio":
      return "audio/mpeg,audio/ogg,audio/mp4,audio/wav,audio/webm,audio/webm;codecs=opus";
    case "video":
      return "video/mp4,video/webm";
    case "document":
      return "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "*/*";
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
