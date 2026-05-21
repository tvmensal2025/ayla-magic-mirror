import { useState, useCallback, useRef } from "react";
import { Send, Mic, Loader2, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { sendWhatsAppMessage } from "@/services/messageSender";
import { toast } from "sonner";

interface Props {
  instanceName: string | null;
  isWhapi: boolean;
  phone: string | null;
  onSent: (kind: "text" | "audio") => void;
}

export function GameComposer({ instanceName, isWhapi, phone, onSent }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const lastSendRef = useRef(0);

  const canSend = !!instanceName && !!phone && !sending;

  const handleSendText = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !canSend || !instanceName || !phone) return;
    if (Date.now() - lastSendRef.current < 800) return;
    lastSendRef.current = Date.now();
    setSending(true);
    try {
      const result = await sendWhatsAppMessage({ instanceName, phone, mediaCategory: "text", text: trimmed, isWhapi });
      if (result.status === "failed") {
        toast.error(result.error || "Falha ao enviar texto");
        return;
      }
      setText("");
      onSent("text");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar");
    } finally {
      setSending(false);
    }
  }, [text, canSend, instanceName, phone, isWhapi, onSent]);

  const sendAudio = useCallback(async (base64: string) => {
    if (!instanceName || !phone) {
      toast.error("Sem WhatsApp conectado ou lead sem telefone");
      return;
    }
    try {
      const audioDataUrl = `data:audio/ogg;base64,${base64}`;
      const result = await sendWhatsAppMessage({
        instanceName, phone, mediaCategory: "audio", mediaUrl: audioDataUrl, isWhapi,
      });
      if (result.status === "failed") {
        toast.error(result.error || "Falha ao enviar áudio");
        return;
      }
      onSent("audio");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar áudio");
    }
  }, [instanceName, phone, isWhapi, onSent]);

  const audio = useAudioRecorder(sendAudio);

  return (
    <div className="rounded-lg border border-primary/30 bg-card/60 backdrop-blur-sm p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-primary">
          💬 Composer livre · texto +5XP · áudio +10XP
        </span>
        {!canSend && !sending && (
          <span className="text-[10px] text-amber-400">
            {!instanceName ? "WhatsApp desconectado" : "Lead sem telefone"}
          </span>
        )}
      </div>

      {audio.isRecording ? (
        <div className="flex items-center gap-2 rounded-md bg-rose-500/10 border border-rose-500/30 px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-xs font-mono text-rose-300">
            Gravando... {audio.formatTime(audio.recordingTime)}
          </span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={audio.cancelRecording} className="h-7 gap-1 text-rose-300 hover:text-rose-200">
            <X className="w-3.5 h-3.5" /> Cancelar
          </Button>
          <Button size="sm" onClick={audio.stopRecording} className="h-7 gap-1 bg-rose-500 hover:bg-rose-600 text-white">
            <Square className="w-3.5 h-3.5" /> Enviar
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSendText();
              }
            }}
            placeholder="Mensagem livre (Enter envia, Shift+Enter quebra linha)"
            rows={2}
            disabled={!canSend}
            className="resize-none text-sm bg-background/60"
          />
          <div className="flex flex-col gap-1">
            <Button
              size="icon"
              variant="outline"
              disabled={!canSend || audio.sending}
              onClick={() => void audio.startRecording()}
              title="Gravar áudio"
              className="h-9 w-9 border-primary/40 hover:bg-primary/10"
            >
              {audio.sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4 text-primary" />}
            </Button>
            <Button
              size="icon"
              disabled={!canSend || !text.trim()}
              onClick={() => void handleSendText()}
              title="Enviar texto"
              className="h-9 w-9 bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
