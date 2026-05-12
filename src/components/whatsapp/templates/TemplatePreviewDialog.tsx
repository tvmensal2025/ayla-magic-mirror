import { File, Play } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MessageTemplate, TemplateMediaType } from "@/types/whatsapp";
import { mediaIcon, mediaBadge } from "./templateUtils";

interface Props {
  template: MessageTemplate | null;
  onClose: () => void;
}

export function TemplatePreviewDialog({ template, onClose }: Props) {
  return (
    <Dialog open={!!template} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {template && mediaIcon((template.media_type as TemplateMediaType) || "text")}
            {template?.name}
          </DialogTitle>
        </DialogHeader>
        {template && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {mediaBadge((template.media_type as TemplateMediaType) || "text")}
              {template.media_type === "text" && (
                <span className="text-[10px] text-green-400/80 flex items-center gap-1">
                  <Play className="w-3 h-3" /> Simulação de digitação
                </span>
              )}
            </div>

            {template.media_url && (
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-3">
                <p className="text-[10px] text-muted-foreground mb-1 font-bold">Mídia anexada:</p>
                {template.media_type === "image" && (
                  <img src={template.media_url} alt="Preview" className="rounded-lg max-h-40 object-contain" />
                )}
                {template.media_type === "audio" && (
                  <audio controls src={template.media_url} className="w-full h-10" />
                )}
                {template.media_type === "document" && (
                  <a href={template.media_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                    <File className="w-3.5 h-3.5" /> Abrir documento
                  </a>
                )}
              </div>
            )}

            {template.image_url && (
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                <p className="text-[10px] text-muted-foreground mb-1 font-bold">📷 Imagem anexa:</p>
                <img src={template.image_url} alt="Imagem anexa" className="rounded-lg max-h-40 object-contain" />
              </div>
            )}

            {template.content && (
              <div className="rounded-xl bg-green-900/20 border border-green-500/10 px-4 py-3 max-w-[280px]">
                <p className="text-sm text-foreground whitespace-pre-wrap">{template.content}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}