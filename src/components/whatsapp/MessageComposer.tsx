import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Paperclip, Mic, MicOff, MessageSquareText, Loader2, Image, File, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickReplyMenu } from "./QuickReplyMenu";
import { Progress } from "@/components/ui/progress";
import type { MessageTemplate } from "@/types/whatsapp";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useFileAttach } from "@/hooks/useFileAttach";

type MediaType = "image" | "video" | "document";

interface MessageComposerProps {
  onSend: (text: string) => Promise<void>;
  onSendAudio?: (audioBase64: string) => Promise<void>;
  onSendAudioUrl?: (audioUrl: string) => Promise<void>;
  onSendMedia?: (mediaUrl: string, caption: string, mediaType: MediaType) => Promise<void>;
  templates: MessageTemplate[];
  disabled?: boolean;
  initialMessage?: string | null;
}

export function MessageComposer({ onSend, onSendAudio, onSendAudioUrl, onSendMedia, templates, disabled, initialMessage }: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showQuickReply, setShowQuickReply] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const audio = useAudioRecorder(onSendAudio);
  const file = useFileAttach();

  useEffect(() => { if (initialMessage != null && initialMessage !== "") setText(initialMessage); }, [initialMessage]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    if (val.startsWith("/")) { setShowQuickReply(true); setQuickSearch(val.slice(1)); }
    else { setShowQuickReply(false); setQuickSearch(""); }
  }, []);

  const handleSend = useCallback(async () => {
    if (file.attachedFile) {
      setSending(true);
      try {
        const trimmed = text.trim();
        if (file.attachedFile.type === "audio" && onSendAudioUrl) {
          await onSendAudioUrl(file.attachedFile.url);
          if (file.pendingImageUrl && onSendMedia) { await new Promise((r) => setTimeout(r, 2500)); await onSendMedia(file.pendingImageUrl, "", "image"); }
          if (trimmed) { await new Promise((r) => setTimeout(r, 1500)); await onSend(trimmed); }
        } else if (onSendMedia) {
          if (file.pendingImageUrl) await onSendMedia(file.pendingImageUrl, "", "image");
          await onSendMedia(file.attachedFile.url, trimmed, file.attachedFile.type as MediaType);
        }
        setText(""); file.clearAttachment(); setShowQuickReply(false);
      } catch {} finally { setSending(false); }
      return;
    }
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      if (file.pendingImageUrl && onSendMedia) { await onSendMedia(file.pendingImageUrl, "", "image"); file.setPendingImageUrl(null); }
      await onSend(trimmed);
      setText(""); setShowQuickReply(false);
    } catch {} finally { setSending(false); }
  }, [text, sending, onSend, onSendMedia, onSendAudioUrl, file]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === "Escape") setShowQuickReply(false);
  }, [handleSend]);

  const handleTemplateSelect = useCallback((t: MessageTemplate) => {
    setText(t.content);
    setShowQuickReply(false);
    if (t.media_url && t.media_type && t.media_type !== "text") {
      const ms = t.media_type as string;
      if (ms === "audio") file.setAttachedFile({ url: t.media_url, name: `${t.name}.audio`, type: "audio" });
      else { const type: MediaType = ms === "image" ? "image" : ms === "video" ? "video" : "document"; file.setAttachedFile({ url: t.media_url, name: `${t.name}.${t.media_type}`, type }); }
    }
    if (t.image_url) file.setPendingImageUrl(t.image_url); else file.setPendingImageUrl(null);
    textareaRef.current?.focus();
  }, [file]);

  if (audio.isRecording) {
    return (
      <div className="relative border-t border-border bg-card p-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={audio.cancelRecording}><MicOff className="h-4 w-4" /></Button>
          <div className="flex-1 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm text-foreground font-mono">{audio.formatTime(audio.recordingTime)}</span>
            <span className="text-xs text-muted-foreground">Gravando...</span>
          </div>
          <Button onClick={audio.stopRecording} size="icon" className="h-8 w-8 bg-primary hover:bg-primary/90"><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative border-t border-border bg-card p-2">
      {showQuickReply && <QuickReplyMenu templates={templates} search={quickSearch} onSelect={handleTemplateSelect} onClose={() => setShowQuickReply(false)} />}

      {file.pendingImageUrl && (
        <div className="flex items-center gap-2 mb-2 px-1 py-1.5 rounded-lg bg-secondary/30 border border-border/30">
          <Image className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-xs text-foreground truncate flex-1">📷 Imagem será enviada antes</span>
          <img src={file.pendingImageUrl} alt="preview" className="h-8 w-8 rounded object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => file.setPendingImageUrl(null)}><X className="w-3 h-3" /></Button>
        </div>
      )}

      {file.attachedFile && (
        <div className="flex items-center gap-2 mb-2 px-1 py-1.5 rounded-lg bg-secondary/30 border border-border/30">
          {file.attachedFile.type === "audio" ? <Mic className="w-4 h-4 text-green-400 shrink-0" /> : file.attachedFile.type === "image" ? <Image className="w-4 h-4 text-blue-400 shrink-0" /> : file.attachedFile.type === "video" ? <Video className="w-4 h-4 text-purple-400 shrink-0" /> : <File className="w-4 h-4 text-red-400 shrink-0" />}
          <span className="text-xs text-foreground truncate flex-1">{file.attachedFile.name}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={file.clearAttachment}><X className="w-3 h-3" /></Button>
        </div>
      )}

      {file.isUploading && (
        <div className="mb-2 px-1"><Progress value={file.uploadProgress} className="h-1" /><p className="text-[10px] text-muted-foreground mt-0.5">Enviando arquivo...</p></div>
      )}

      <div className="flex items-end gap-1.5">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary" disabled={disabled} onClick={() => { setShowQuickReply(!showQuickReply); setQuickSearch(""); }} title="Respostas rápidas"><MessageSquareText className="h-4 w-4" /></Button>
        <input ref={file.fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/mp4,audio/wav,audio/webm,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={file.handleFileSelect} className="hidden" />
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary" disabled={disabled || file.isUploading} onClick={() => file.fileInputRef.current?.click()} title="Anexar arquivo"><Paperclip className="h-4 w-4" /></Button>
        <textarea ref={textareaRef} value={text} onChange={handleChange} onKeyDown={handleKeyDown} placeholder={file.attachedFile ? "Legenda (opcional)..." : 'Mensagem (use "/" para respostas rápidas)'} disabled={disabled} rows={1} className="flex-1 resize-none bg-secondary rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring min-h-[36px] max-h-[120px]" style={{ overflow: "auto" }} />
        {text.trim() || file.attachedFile ? (
          <Button onClick={handleSend} disabled={sending || disabled || file.isUploading} size="icon" className="h-8 w-8 shrink-0 bg-primary hover:bg-primary/90">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
        ) : (
          <Button onClick={audio.startRecording} disabled={disabled || !onSendAudio} size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary" title="Gravar áudio"><Mic className="h-4 w-4" /></Button>
        )}
      </div>
    </div>
  );
}
