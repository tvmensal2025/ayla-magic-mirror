import { useState } from "react";
import { Play, Upload, Trash2, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AudioRecorderInline } from "./AudioRecorderInline";

export type SlotRow = {
  slot_key: string;
  label: string;
  description: string | null;
  trigger_hint: string | null;
  fallback_text: string | null;
  position: number;
};

export type SlotMedia = {
  id: string;
  url: string | null;
  is_public: boolean;
  is_draft: boolean;
  active: boolean;
  sent_count: number;
  reply_count: number;
};

type Props = {
  userId: string;
  slot: SlotRow;
  defaultMedia: SlotMedia | null;
  personalMedia: SlotMedia | null;
  onChange: () => void;
};

export function SlotCard({ userId, slot, defaultMedia, personalMedia, onChange }: Props) {
  const { toast } = useToast();
  const [usingPersonal, setUsingPersonal] = useState(!!personalMedia?.active);
  const hasPersonal = !!personalMedia;
  const hasPersonalActive = !!(personalMedia && personalMedia.active && !personalMedia.is_draft);

  const activeMedia = usingPersonal && personalMedia ? personalMedia : defaultMedia;
  const personalReplyRate = personalMedia && personalMedia.sent_count > 0
    ? Math.round((personalMedia.reply_count / personalMedia.sent_count) * 100)
    : null;
  const defaultReplyRate = defaultMedia && defaultMedia.sent_count > 0
    ? Math.round((defaultMedia.reply_count / defaultMedia.sent_count) * 100)
    : null;

  async function uploadAudioBlob(blob: Blob) {
    const path = `${userId}/slots/${slot.slot_key}.webm`;
    const { error: upErr } = await supabase.storage
      .from("ai-agent-media")
      .upload(path, blob, { upsert: true, contentType: blob.type || "audio/webm" });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from("ai-agent-media").getPublicUrl(path);
    return { url: data.publicUrl, path };
  }

  async function handleRecorded(blob: Blob, durationSec: number) {
    try {
      const { url, path } = await uploadAudioBlob(blob);
      const payload = {
        consultant_id: userId,
        kind: "audio",
        slot_key: slot.slot_key,
        label: slot.label,
        url,
        storage_path: path,
        duration_sec: durationSec,
        active: true,
        is_draft: false,
        is_public: false,
      };
      // upsert por (consultant_id, slot_key) onde is_public=false
      if (personalMedia) {
        const { error } = await supabase
          .from("ai_media_library")
          .update(payload)
          .eq("id", personalMedia.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ai_media_library").insert(payload);
        if (error) throw error;
      }
      toast({ title: "🎙️ Áudio salvo e ativado!" });
      setUsingPersonal(true);
      onChange();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    }
  }

  async function handleFileUpload(file: File) {
    if (!file.type.startsWith("audio/")) {
      toast({ title: "Envie um arquivo de áudio", variant: "destructive" });
      return;
    }
    await handleRecorded(file, 0);
  }

  async function removePersonal() {
    if (!personalMedia) return;
    if (!confirm("Remover seu áudio personalizado e voltar ao padrão?")) return;
    const { error } = await supabase.from("ai_media_library").delete().eq("id", personalMedia.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Voltou para o áudio padrão" });
    setUsingPersonal(false);
    onChange();
  }

  async function toggleActive(usePersonalNow: boolean) {
    if (usePersonalNow && !hasPersonal) return;
    setUsingPersonal(usePersonalNow);
    if (personalMedia) {
      await supabase
        .from("ai_media_library")
        .update({ active: usePersonalNow })
        .eq("id", personalMedia.id);
      onChange();
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {slot.label}
          </h3>
          {slot.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{slot.description}</p>
          )}
        </div>
        <Badge variant={hasPersonalActive && usingPersonal ? "default" : "secondary"} className="shrink-0">
          {hasPersonalActive && usingPersonal ? "Em uso: Meu áudio" : "Em uso: Padrão"}
        </Badge>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={!usingPersonal ? "default" : "outline"}
          onClick={() => toggleActive(false)}
          className="flex-1"
        >
          {!usingPersonal && <CheckCircle2 className="w-4 h-4 mr-1" />}
          Padrão (Camila)
        </Button>
        <Button
          size="sm"
          variant={usingPersonal ? "default" : "outline"}
          onClick={() => toggleActive(true)}
          disabled={!hasPersonalActive}
          title={!hasPersonalActive ? "Grave abaixo para ativar" : ""}
          className="flex-1"
        >
          {usingPersonal && <CheckCircle2 className="w-4 h-4 mr-1" />}
          Meu áudio
        </Button>
      </div>

      {activeMedia?.url ? (
        <audio src={activeMedia.url} controls className="w-full h-9" />
      ) : (
        <div className="text-xs text-muted-foreground italic p-2 rounded-md bg-muted/30">
          Sem áudio ainda — a IA enviará: <span className="text-foreground">"{slot.fallback_text}"</span>
        </div>
      )}

      {(personalReplyRate !== null || defaultReplyRate !== null) && (
        <div className="text-xs text-muted-foreground flex gap-4">
          {defaultReplyRate !== null && <span>📊 Padrão: {defaultReplyRate}% resposta</span>}
          {personalReplyRate !== null && <span className="text-primary">Seu: {personalReplyRate}% resposta</span>}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
        <AudioRecorderInline onRecorded={handleRecorded} />
        <label className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted cursor-pointer">
          <Upload className="w-4 h-4" />
          Enviar arquivo
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          />
        </label>
        {personalMedia && (
          <Button size="sm" variant="ghost" onClick={removePersonal} className="text-destructive">
            <Trash2 className="w-4 h-4 mr-1" /> Remover meu
          </Button>
        )}
      </div>

      {slot.trigger_hint && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">Quando a IA usa este áudio?</summary>
          <p className="mt-1 pl-4 italic">{slot.trigger_hint}</p>
        </details>
      )}
    </div>
  );
}
