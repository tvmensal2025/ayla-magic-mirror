import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Bookmark } from "lucide-react";
import { uploadMedia } from "@/services/minioUpload";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ChatMessage } from "@/hooks/useMessages";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  message: ChatMessage;
  consultantId: string;
  loadedMediaUrl: string | null;
  /** Foco inicial: nome ou atalho */
  focus?: "name" | "shortcut";
  onSaved?: () => void;
}

const SHORTCUT_RE = /^\/[a-z0-9_-]{2,20}$/;

function inferExt(mime: string | undefined, fallback: string): string {
  if (!mime) return fallback;
  const m = mime.toLowerCase();
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("m4a") || m.includes("mp4a")) return "m4a";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  return fallback;
}

export function SaveMessageAsTemplateDialog({ open, onOpenChange, message, consultantId, loadedMediaUrl, focus = "name", onSaved }: Props) {
  const [name, setName] = useState("");
  const [shortcutRaw, setShortcutRaw] = useState("");
  const [caption, setCaption] = useState(message.mediaCaption || message.text || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setShortcutRaw("");
      setCaption(message.mediaCaption || message.text || "");
    }
  }, [open, message]);

  const shortcutNormalized = useMemo(() => {
    if (!shortcutRaw.trim()) return "";
    let s = shortcutRaw.trim().toLowerCase();
    if (!s.startsWith("/")) s = "/" + s;
    return s.replace(/\s+/g, "");
  }, [shortcutRaw]);

  const shortcutInvalid = !!shortcutNormalized && !SHORTCUT_RE.test(shortcutNormalized);

  const mt = message.mediaType || "text";
  const isTextOnly = mt === "text";
  const hasMedia = mt === "audio" || mt === "video" || mt === "image";
  const canSave =
    !!name.trim() &&
    !shortcutInvalid &&
    (isTextOnly ? !!caption.trim() : !!loadedMediaUrl && hasMedia);

  const disabledReason = !name.trim()
    ? "Dê um nome ao template"
    : shortcutInvalid
      ? "Atalho precisa ter pelo menos 2 letras/números após a /"
      : isTextOnly && !caption.trim()
        ? "Digite o texto do template"
        : !isTextOnly && !loadedMediaUrl
          ? "Aguarde a mídia carregar (toque no player da mensagem)"
          : "";

  const handleSave = async () => {
    setSaving(true);
    try {
      let mediaUrl: string | null = null;

      if (hasMedia) {
        if (!loadedMediaUrl) {
          toast.error("Mídia ainda não carregou — aguarde o player exibir o conteúdo e tente de novo.");
          return;
        }
        // Baixa a mídia (URL temporária ou já MinIO) e re-faz upload pro MinIO no scope=template
        const res = await fetch(loadedMediaUrl);
        if (!res.ok) throw new Error(`Falha ao baixar mídia (${res.status})`);
        const blob = await res.blob();
        const mime = blob.type || message.mediaMimetype || "application/octet-stream";
        const ext = inferExt(mime, mt === "audio" ? "ogg" : mt === "video" ? "mp4" : "jpg");
        const safeName = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "template";
        const file = new File([blob], `${safeName}.${ext}`, { type: mime });

        const uploaded = await uploadMedia(file, undefined, {
          scope: "template",
          consultant_id: consultantId,
          kind: mt,
          slug: safeName,
        });
        mediaUrl = uploaded.url;
      }

      const payload: any = {
        consultant_id: consultantId,
        name: name.trim(),
        content: caption.trim(),
        media_type: mt,
        media_url: mediaUrl,
      };
      if (shortcutNormalized) payload.shortcut = shortcutNormalized;

      const { error } = await supabase.from("message_templates").insert(payload);
      if (error) {
        if (String(error.message).includes("message_templates_consultant_shortcut_uniq")) {
          throw new Error(`O atalho "${shortcutNormalized}" já está em uso.`);
        }
        const detail = [error.message, (error as any).details, (error as any).hint, error.code]
          .filter(Boolean).join(" · ");
        throw new Error(detail || "Falha desconhecida");
      }
      toast.success(`Template "${name.trim()}" salvo${shortcutNormalized ? ` (atalho ${shortcutNormalized})` : ""}`);
      try { window.dispatchEvent(new Event("templates:refresh")); } catch (_) {}
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-primary" />
            Salvar como template
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Preview */}
          {loadedMediaUrl && mt === "image" && (
            <img src={loadedMediaUrl} alt="" className="max-h-40 rounded mx-auto" />
          )}
          {loadedMediaUrl && mt === "audio" && (
            <audio controls src={loadedMediaUrl} className="w-full" />
          )}
          {loadedMediaUrl && mt === "video" && (
            <video controls src={loadedMediaUrl} className="max-h-40 w-full rounded" />
          )}
          {!loadedMediaUrl && (
            <div className="text-xs text-muted-foreground bg-secondary/40 rounded p-2 text-center">
              Carregando mídia... toque no player da mensagem antes de salvar.
            </div>
          )}

          <div>
            <Label className="text-xs">Nome *</Label>
            <Input
              autoFocus={focus === "name"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Boas-vindas, Áudio explicação"
              maxLength={60}
            />
          </div>

          <div>
            <Label className="text-xs">Atalho rápido (opcional)</Label>
            <Input
              autoFocus={focus === "shortcut"}
              value={shortcutRaw}
              onChange={(e) => setShortcutRaw(e.target.value)}
              placeholder="/oi"
              className={shortcutInvalid ? "border-destructive" : ""}
            />
            <p className={`text-[10px] mt-1 ${shortcutInvalid ? "text-destructive" : "text-muted-foreground"}`}>
              {shortcutInvalid
                ? "Atalho precisa ter pelo menos 2 letras/números após a / (ex: /oi)"
                : "Digite no chat (ex: /oi) e o template é enviado direto"}
            </p>
          </div>

          {(mt === "image" || mt === "video") && (
            <div>
              <Label className="text-xs">Legenda (opcional)</Label>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Texto que vai junto da mídia"
                rows={2}
              />
            </div>
          )}

          {isTextOnly && (
            <div>
              <Label className="text-xs">Texto *</Label>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Conteúdo do template. Use {{nome}} e {{valor_conta}}"
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {disabledReason && (
            <p className="text-[11px] text-amber-500 flex-1 text-left">⚠️ {disabledReason}</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!canSave || saving} title={disabledReason || undefined}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Bookmark className="w-4 h-4 mr-1" />}
              Salvar template
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
