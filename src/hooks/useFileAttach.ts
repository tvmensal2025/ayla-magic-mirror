import { useState, useRef, useCallback } from "react";
import { uploadMedia, formatFileSize } from "@/services/minioUpload";
import { toast } from "sonner";
import { createLogger } from "@/lib/logger";

const logger = createLogger("useFileAttach");

type MediaType = "image" | "video" | "document";

export interface AttachedFile {
  url: string;
  name: string;
  type: MediaType | "audio";
}

export function useFileAttach() {
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { toast.error("Arquivo muito grande (máximo 100MB)"); return; }

    setIsUploading(true);
    setUploadProgress(0);
    try {
      const result = await uploadMedia(file, (pct) => setUploadProgress(pct));
      if (attachedFile?.type === "audio" && file.type.startsWith("image/")) {
        setPendingImageUrl(result.url);
        toast.success("Imagem anexada: será enviada depois do áudio");
      } else {
        let fileType: MediaType = "document";
        if (file.type.startsWith("image/")) fileType = "image";
        else if (file.type.startsWith("video/")) fileType = "video";
        setAttachedFile({ url: result.url, name: file.name, type: fileType });
        toast.success(`Arquivo anexado: ${formatFileSize(result.size)}`);
      }
    } catch (err: unknown) {
      logger.error("Erro no upload:", err);
      toast.error(`Erro no upload: ${err instanceof Error ? err.message : "Falha desconhecida"}`, { duration: 8000 });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [attachedFile]);

  const clearAttachment = useCallback(() => { setAttachedFile(null); setPendingImageUrl(null); }, []);

  return { attachedFile, setAttachedFile, pendingImageUrl, setPendingImageUrl, isUploading, uploadProgress, fileInputRef, handleFileSelect, clearAttachment };
}
