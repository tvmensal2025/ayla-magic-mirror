import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare, Image, Video, Mic, X, Check, Bold, Upload, Loader2, Plus, Trash2, GripVertical } from "lucide-react";
import { uploadMedia, getAcceptString, formatFileSize } from "@/services/minioUpload";
import { useToast } from "@/hooks/use-toast";
import { REJECTION_REASONS } from "./DropConfirmDialog";

interface StageAutoMessageConfigProps {
  stageId: string;
  stageLabel: string;
  stageKey: string;
  consultantId: string;
  /** Legacy single-message fields (for migration display) */
  autoMessageText: string | null;
  autoMessageType: string;
  autoMessageMediaUrl: string | null;
  autoMessageImageUrl: string | null;
  onSave: (text: string | null, type: string, mediaUrl: string | null, imageUrl: string | null) => void;
}

interface AutoMessage {
  id?: string;
  position: number;
  message_type: string;
  message_text: string;
  media_url: string;
  image_url: string;
  delay_seconds: number;
  rejection_reason: string;
  deal_origin: string;
}

const DEAL_ORIGIN_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "aprovado", label: "Aprovados" },
  { value: "reprovado", label: "Reprovados" },
];

const MESSAGE_TYPES = [
  { key: "text", label: "Texto", icon: MessageSquare },
  { key: "image", label: "Imagem", icon: Image },
  { key: "video", label: "Vídeo", icon: Video },
  { key: "audio", label: "Áudio", icon: Mic },
];

function MessageItem({
  msg,
  index,
  onChange,
  onRemove,
  showRejectionReason,
  showDealOrigin,
}: {
  msg: AutoMessage;
  index: number;
  onChange: (updated: AutoMessage) => void;
  onRemove: () => void;
  showRejectionReason: boolean;
  showDealOrigin: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadMedia(file);
      onChange({ ...msg, media_url: result.url });
      toast({ title: "Upload concluído", description: `${file.name} (${formatFileSize(file.size)})` });
    } catch {
      toast({ title: "Erro no upload", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const result = await uploadMedia(file);
      onChange({ ...msg, image_url: result.url });
      toast({ title: "Imagem enviada" });
    } catch {
      toast({ title: "Erro no upload", variant: "destructive" });
    } finally {
      setUploadingImage(false);
      if (imgRef.current) imgRef.current.value = "";
    }
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-secondary/20">
      <div className="flex items-center gap-2">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
        <Badge variant="secondary" className="text-[9px]">Msg {index + 1}</Badge>
        {msg.rejection_reason && (
          <Badge variant="outline" className="text-[8px]">
            {REJECTION_REASONS.find((r) => r.value === msg.rejection_reason)?.label || msg.rejection_reason}
          </Badge>
        )}
        {msg.deal_origin && (
          <Badge variant="outline" className="text-[8px]">
            {DEAL_ORIGIN_OPTIONS.find((o) => o.value === msg.deal_origin)?.label || msg.deal_origin}
          </Badge>
        )}

        {/* Delay */}
        {index > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[9px] text-muted-foreground">Delay:</span>
            <Input
              type="number"
              min={0}
              value={msg.delay_seconds}
              onChange={(e) => onChange({ ...msg, delay_seconds: parseInt(e.target.value) || 0 })}
              className="h-6 w-16 text-[10px]"
            />
            <span className="text-[9px] text-muted-foreground">seg</span>
          </div>
        )}

        <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive ml-auto" onClick={onRemove}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Type selector */}
      <div className="flex gap-1">
        {MESSAGE_TYPES.map((mt) => {
          const Icon = mt.icon;
          return (
            <Button
              key={mt.key}
              variant={msg.message_type === mt.key ? "default" : "outline"}
              size="sm"
              className="h-6 text-[9px] gap-0.5 flex-1"
              onClick={() => onChange({ ...msg, message_type: mt.key })}
            >
              <Icon className="h-2.5 w-2.5" />
              {mt.label}
            </Button>
          );
        })}
      </div>

      {/* Media upload */}
      {msg.message_type !== "text" && (
        <div className="space-y-1">
          <input ref={fileRef} type="file" accept={getAcceptString(msg.message_type)} onChange={handleFileUpload} className="hidden" />
          <div className="flex gap-1.5">
            <Input
              value={msg.media_url}
              onChange={(e) => onChange({ ...msg, media_url: e.target.value })}
              placeholder="URL da mídia ou faça upload →"
              className="h-7 text-[10px] flex-1"
            />
            <Button variant="outline" size="sm" className="h-7 text-[9px] gap-0.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {uploading ? "..." : "Upload"}
            </Button>
          </div>
        </div>
      )}

      {/* Optional image */}
      {msg.message_type !== "image" && (
        <div className="space-y-1">
          <input ref={imgRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          <p className="text-[9px] text-muted-foreground">📷 Imagem opcional (antes da mensagem)</p>
          <div className="flex gap-1.5">
            <Input
              value={msg.image_url}
              onChange={(e) => onChange({ ...msg, image_url: e.target.value })}
              placeholder="URL da imagem"
              className="h-7 text-[10px] flex-1"
            />
            <Button variant="outline" size="sm" className="h-7 text-[9px] gap-0.5" disabled={uploadingImage} onClick={() => imgRef.current?.click()}>
              {uploadingImage ? <Loader2 className="h-3 w-3 animate-spin" /> : <Image className="h-3 w-3" />}
              Img
            </Button>
          </div>
          {msg.image_url && (
            <div className="flex items-center gap-1">
              <img src={msg.image_url} alt="" className="h-8 w-8 rounded object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <Button variant="ghost" size="icon" className="h-4 w-4 text-destructive" onClick={() => onChange({ ...msg, image_url: "" })}>
                <X className="h-2.5 w-2.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Rejection reason (only for reprovado stages) */}
      {showRejectionReason && (
        <div className="space-y-1">
          <p className="text-[9px] text-muted-foreground">🏷 Motivo (só dispara para este motivo):</p>
          <Select value={msg.rejection_reason || "all"} onValueChange={(v) => onChange({ ...msg, rejection_reason: v === "all" ? "" : v })}>
            <SelectTrigger className="h-7 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[10px]">Todos os motivos</SelectItem>
              {REJECTION_REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value} className="text-[10px]">{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Deal origin (for time-based stages like 30, 60, 90, 120 dias) */}
      {showDealOrigin && (
        <div className="space-y-1">
          <p className="text-[9px] text-muted-foreground">🔄 Origem (só dispara para leads desta origem):</p>
          <Select value={msg.deal_origin || "all"} onValueChange={(v) => onChange({ ...msg, deal_origin: v === "all" ? "" : v })}>
            <SelectTrigger className="h-7 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEAL_ORIGIN_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-[10px]">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Text */}
      <Textarea
        value={msg.message_text}
        onChange={(e) => onChange({ ...msg, message_text: e.target.value })}
        placeholder="Texto da mensagem (use *negrito*, _itálico_, {{nome}}, {{telefone}})"
        className="min-h-[60px] text-[10px] resize-none"
      />
    </div>
  );
}

export function StageAutoMessageConfig({
  stageId,
  stageLabel,
  stageKey,
  consultantId,
  autoMessageText,
  autoMessageType,
  autoMessageMediaUrl,
  autoMessageImageUrl,
  onSave,
}: StageAutoMessageConfigProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AutoMessage[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from("stage_auto_messages")
      .select("*")
      .eq("stage_id", stageId)
      .eq("consultant_id", consultantId)
      .order("position", { ascending: true });

    if (data && data.length > 0) {
      setMessages(
        data.map((d: any) => ({
          id: d.id,
          position: d.position,
          message_type: d.message_type || "text",
          message_text: d.message_text || "",
          media_url: d.media_url || "",
          image_url: d.image_url || "",
          delay_seconds: d.delay_seconds || 0,
          rejection_reason: d.rejection_reason || "",
          deal_origin: (d as any).deal_origin || "",
        }))
      );
    } else if (autoMessageText || autoMessageMediaUrl || autoMessageImageUrl) {
      setMessages([
        {
          position: 0,
          message_type: autoMessageType || "text",
          message_text: autoMessageText || "",
          media_url: autoMessageMediaUrl || "",
          image_url: autoMessageImageUrl || "",
          delay_seconds: 0,
          rejection_reason: "",
          deal_origin: "",
        },
      ]);
    } else {
      setMessages([]);
    }
  }, [stageId, consultantId, autoMessageText, autoMessageType, autoMessageMediaUrl, autoMessageImageUrl]);

  useEffect(() => {
    if (open) fetchMessages();
  }, [open, fetchMessages]);

  const addMessage = () => {
    setMessages((prev) => [
      ...prev,
      {
        position: prev.length,
        message_type: "text",
        message_text: "",
        media_url: "",
        image_url: "",
        delay_seconds: prev.length > 0 ? 5 : 0,
        rejection_reason: "",
        deal_origin: "",
      },
    ]);
  };

  const updateMessage = (index: number, updated: AutoMessage) => {
    setMessages((prev) => prev.map((m, i) => (i === index ? updated : m)));
  };

  const removeMessage = (index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index).map((m, i) => ({ ...m, position: i })));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete existing messages for this stage
      await supabase
        .from("stage_auto_messages")
        .delete()
        .eq("stage_id", stageId)
        .eq("consultant_id", consultantId);

      // Insert new messages
      if (messages.length > 0) {
        const inserts = messages.map((m, i) => ({
          stage_id: stageId,
          consultant_id: consultantId,
          position: i,
          message_type: m.message_type,
          message_text: m.message_text.trim() || null,
          media_url: m.media_url.trim() || null,
          image_url: m.image_url.trim() || null,
          delay_seconds: m.delay_seconds,
          rejection_reason: m.rejection_reason.trim() || null,
          deal_origin: m.deal_origin.trim() || null,
        }));
        const { error } = await supabase.from("stage_auto_messages").insert(inserts);
        if (error) throw error;
      }

      // Also update legacy fields on kanban_stages for backward compat
      const first = messages[0];
      onSave(
        first?.message_text?.trim() || null,
        first?.message_type || "text",
        first?.media_url?.trim() || null,
        first?.image_url?.trim() || null
      );

      toast({ title: `${messages.length} mensagem(ns) salva(s)!` });
      setOpen(false);
    } catch (err: unknown) {
      toast({ title: "Erro ao salvar", description: err instanceof Error ? err.message : "Falha", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hasAutoMessage = !!autoMessageText || messages.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-5 w-5 ${hasAutoMessage ? "text-primary" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
          title={hasAutoMessage ? "Mensagens automáticas configuradas" : "Configurar mensagens automáticas"}
        >
          <MessageSquare className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            Mensagens Automáticas
            <Badge variant="secondary" className="text-[10px]">{stageLabel}</Badge>
          </DialogTitle>
        </DialogHeader>

        <p className="text-[10px] text-muted-foreground -mt-1">
          Configure múltiplas mensagens para envio sequencial quando um lead entrar nesta coluna.
        </p>

        <div className="space-y-3">
          {messages.map((msg, i) => (
            <MessageItem
              key={i}
              msg={msg}
              index={i}
              onChange={(updated) => updateMessage(i, updated)}
              onRemove={() => removeMessage(i)}
              showRejectionReason={stageKey === "reprovado"}
              showDealOrigin={["30_dias", "60_dias", "90_dias", "120_dias"].includes(stageKey)}
            />
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-[10px] gap-1 border-dashed"
          onClick={addMessage}
        >
          <Plus className="h-3 w-3" />
          Adicionar Mensagem
        </Button>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
