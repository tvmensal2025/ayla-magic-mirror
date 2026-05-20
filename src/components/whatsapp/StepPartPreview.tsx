import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Mic, Image as ImageIcon, Video, FileText, ExternalLink } from "lucide-react";

export type PartKind = "text" | "audio" | "image" | "video" | "document";

interface Props {
  kind: PartKind;
  text?: string | null;
  url?: string | null;
  fileName?: string | null;
  compact?: boolean;
}

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  audio: Mic, image: ImageIcon, video: Video, document: FileText, text: FileText,
};

export function StepPartPreview({ kind, text, url, fileName, compact }: Props) {
  const [zoom, setZoom] = useState(false);
  const Icon = KIND_ICON[kind] || FileText;
  const displayName = fileName || (url ? url.split("/").pop()?.split("?")[0] : "") || "";

  return (
    <div className="flex items-start gap-3 w-full min-w-0">
      <Icon className="w-4 h-4 text-primary shrink-0 mt-1" />
      <div className="flex-1 min-w-0 space-y-2">
        <Badge variant="secondary" className="text-[10px]">{kind}</Badge>

        {kind === "text" && text && (
          <div className={`bg-secondary/40 rounded-lg p-2.5 text-xs whitespace-pre-wrap break-words border border-border ${compact ? "max-h-24" : "max-h-48"} overflow-y-auto`}>
            {text}
          </div>
        )}

        {kind === "audio" && url && (
          <audio controls preload="metadata" src={url} className="w-full h-9" />
        )}

        {kind === "image" && url && (
          <>
            <button type="button" onClick={() => setZoom(true)} className="block">
              <img
                src={url}
                alt={displayName}
                className={`rounded-md border border-border object-cover ${compact ? "h-20 w-20" : "h-32 w-32"} hover:opacity-80 transition`}
                loading="lazy"
              />
            </button>
            <Dialog open={zoom} onOpenChange={setZoom}>
              <DialogContent className="max-w-3xl p-2 bg-background">
                <img src={url} alt={displayName} className="w-full h-auto rounded" />
              </DialogContent>
            </Dialog>
          </>
        )}

        {kind === "video" && url && (
          <video controls preload="metadata" src={url} className={`rounded-md border border-border ${compact ? "max-h-32" : "max-h-56"} w-auto`} />
        )}

        {kind === "document" && url && (
          <a href={url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
            <ExternalLink className="w-3 h-3" />
            {displayName || "Abrir documento"}
          </a>
        )}
      </div>
    </div>
  );
}
