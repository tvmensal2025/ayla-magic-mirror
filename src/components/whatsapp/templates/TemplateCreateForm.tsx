import { useState, useRef, useCallback } from "react";
import { Plus, Image, Mic, File, Upload, Loader2, CheckCircle2, Square, X, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import type { TemplateMediaType } from "@/types/whatsapp";
import { uploadMedia, getAcceptString, formatFileSize } from "@/services/minioUpload";
import { toast } from "sonner";
import { MEDIA_TYPES, formatRecordingTime } from "./templateUtils";

interface Props {
  onCreateTemplate: (name: string, content: string, mediaType?: string, mediaUrl?: string | null, imageUrl?: string | null) => Promise<void>;
}

export function TemplateCreateForm({ onCreateTemplate }: Props) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [mediaType, setMediaType] = useState<TemplateMediaType>("text");
  const [mediaUrl, setMediaUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image upload state
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const [uploadedImageName, setUploadedImageName] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = Object.assign(blob, { name: `gravacao_${Date.now()}.webm`, lastModified: Date.now() }) as unknown as File;
        setIsUploading(true);
        setUploadProgress(0);
        setUploadedFileName(file.name);
        try {
          const result = await uploadMedia(file, (pct) => setUploadProgress(pct));
          setMediaUrl(result.url);
          toast.success(`Áudio gravado e enviado: ${formatFileSize(result.size)}`);
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : "Erro no upload do áudio");
          setUploadedFileName("");
        } finally {
          setIsUploading(false);
        }
      };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((p) => p + 1), 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
    }
    chunksRef.current = [];
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { toast.error("Arquivo muito grande (máximo 100MB)"); return; }
    setIsUploading(true);
    setUploadProgress(0);
    setUploadedFileName(file.name);
    try {
      const result = await uploadMedia(file, (pct) => setUploadProgress(pct));
      setMediaUrl(result.url);
      toast.success(`Arquivo enviado: ${formatFileSize(result.size)}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro no upload");
      setUploadedFileName("");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { toast.error("Arquivo muito grande (máximo 100MB)"); return; }
    setIsUploadingImage(true);
    setImageUploadProgress(0);
    setUploadedImageName(file.name);
    try {
      const result = await uploadMedia(file, (pct) => setImageUploadProgress(pct));
      setImageUrl(result.url);
      toast.success(`Imagem enviada: ${formatFileSize(result.size)}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro no upload da imagem");
      setUploadedImageName("");
    } finally {
      setIsUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  async function handleCreate() {
    if (!name.trim()) return;
    if (mediaType === "text" && !content.trim()) return;
    if (mediaType !== "text" && !mediaUrl.trim()) return;
    setIsSaving(true);
    try {
      await onCreateTemplate(
        name.trim(),
        content.trim(),
        mediaType,
        mediaType !== "text" ? mediaUrl.trim() : null,
        imageUrl.trim() || null
      );
      setName(""); setContent(""); setMediaType("text"); setMediaUrl(""); setImageUrl("");
      setUploadedFileName(""); setUploadedImageName("");
    } finally {
      setIsSaving(false);
    }
  }

  const canSave = name.trim() && (
    (mediaType === "text" && content.trim()) ||
    (mediaType !== "text" && mediaUrl.trim())
  );

  return (
    <div className="border-t border-border/30 pt-5 space-y-4">
      <p className="text-sm font-bold text-foreground flex items-center gap-2">
        <Plus className="w-4 h-4 text-purple-400" /> Novo Template
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {MEDIA_TYPES.map((mt) => {
          const Icon = mt.icon;
          const isActive = mediaType === mt.value;
          return (
            <button
              key={mt.value}
              onClick={() => { setMediaType(mt.value); setMediaUrl(""); setUploadedFileName(""); }}
              disabled={isSaving}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all text-center ${
                isActive
                  ? "border-purple-500/50 bg-purple-500/10 shadow-lg shadow-purple-500/5"
                  : "border-border/40 bg-secondary/10 hover:border-border/60 hover:bg-secondary/20"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-purple-400" : "text-muted-foreground"}`} />
              <span className={`text-xs font-bold ${isActive ? "text-purple-400" : "text-muted-foreground"}`}>{mt.label}</span>
            </button>
          );
        })}
      </div>

      <Input placeholder="Nome do template" value={name} onChange={(e) => setName(e.target.value)} disabled={isSaving} className="rounded-xl bg-secondary/50 border-border/50" />

      <Textarea
        placeholder={mediaType === "text" ? "Conteúdo da mensagem..." : "Legenda / texto da mensagem (opcional)..."}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        disabled={isSaving}
        className="rounded-xl bg-secondary/30 border-border/40 resize-none"
      />

      {mediaType !== "text" && (
        <div className="space-y-3">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            {mediaType === "image" && <><Image className="w-3.5 h-3.5 text-blue-400" /> Imagem</>}
            {mediaType === "audio" && <><Mic className="w-3.5 h-3.5 text-orange-400" /> Áudio (MP3, OGG)</>}
            {mediaType === "document" && <><File className="w-3.5 h-3.5 text-red-400" /> Documento (PDF)</>}
          </label>

          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept={getAcceptString(mediaType)} onChange={handleFileUpload} disabled={isSaving || isUploading} className="hidden" />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isSaving || isUploading}
              className="gap-2 rounded-xl border-dashed border-2 border-border/60 hover:border-purple-500/40 hover:bg-purple-500/5 flex-1 h-12">
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> : uploadedFileName ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
              <span className="text-xs truncate">
                {isUploading ? "Enviando..." : uploadedFileName ? uploadedFileName : "Clique para enviar arquivo"}
              </span>
            </Button>
          </div>

          {mediaType === "audio" && (
            <div className="space-y-2">
              {isRecording ? (
                <div className="flex items-center gap-3 rounded-xl border-2 border-red-500/40 bg-red-500/5 px-4 py-3 animate-pulse">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-bold text-red-400 tabular-nums">{formatRecordingTime(recordingTime)}</span>
                  <span className="text-xs text-muted-foreground">Gravando...</span>
                  <div className="ml-auto flex items-center gap-2">
                    <Button type="button" variant="ghost" size="icon" onClick={cancelRecording} className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10">
                      <X className="w-4 h-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={stopRecording} className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10">
                      <Square className="w-4 h-4 fill-current" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="outline" onClick={startRecording} disabled={isSaving || isUploading}
                  className="gap-2 rounded-xl border-dashed border-2 border-orange-500/30 hover:border-orange-500/50 hover:bg-orange-500/5 w-full h-12">
                  <Mic className="w-4 h-4 text-orange-400" />
                  <span className="text-xs text-orange-400 font-bold">Gravar áudio agora</span>
                </Button>
              )}
            </div>
          )}

          {isUploading && <Progress value={uploadProgress} className="h-1.5" />}

          {mediaUrl && !isUploading && (
            <div className="rounded-lg border border-border/30 bg-secondary/10 p-2 overflow-hidden">
              {mediaType === "image" && (
                <img src={mediaUrl} alt="Preview" className="rounded-lg max-h-32 object-contain" onError={(e) => { (e.target as HTMLImageElement).replaceWith(Object.assign(document.createElement("p"), { className: "text-xs text-muted-foreground py-2", textContent: "⚠️ Não foi possível carregar preview" })); }} />
              )}
              {mediaType === "audio" && <audio controls src={mediaUrl} className="w-full h-8" />}
              {mediaType === "document" && (
                <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                  <File className="w-3.5 h-3.5" /> Abrir documento
                </a>
              )}
            </div>
          )}

          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground/60">Ou cole uma URL manualmente:</p>
            <Input placeholder="https://exemplo.com/arquivo..." value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} disabled={isSaving || isUploading} className="rounded-xl bg-secondary/50 border-border/50 font-mono text-xs" />
          </div>

          <p className="text-[10px] text-muted-foreground/60">
            {mediaType === "audio" && "Formatos aceitos: MP3, OGG. Será enviado como mensagem de voz."}
            {mediaType === "image" && "Formatos aceitos: JPG, PNG, WEBP."}
            {mediaType === "document" && "Formatos aceitos: PDF, DOCX, XLSX."}
          </p>
        </div>
      )}

      {mediaType !== "image" && (
        <div className="space-y-2 border border-border/20 rounded-xl p-3 bg-blue-500/3">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Image className="w-3.5 h-3.5 text-blue-400" /> Imagem anexa (opcional)
          </label>
          <p className="text-[10px] text-muted-foreground/60">Envie uma imagem junto com a mensagem</p>
          <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} disabled={isSaving || isUploadingImage} className="hidden" />
          <Button type="button" variant="outline" onClick={() => imageInputRef.current?.click()} disabled={isSaving || isUploadingImage}
            className="gap-2 rounded-xl border-dashed border-2 border-blue-500/30 hover:border-blue-500/50 hover:bg-blue-500/5 w-full h-10">
            {isUploadingImage ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : uploadedImageName ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Image className="w-4 h-4 text-blue-400" />}
            <span className="text-xs truncate">
              {isUploadingImage ? "Enviando imagem..." : uploadedImageName ? uploadedImageName : "Anexar imagem (opcional)"}
            </span>
          </Button>
          {isUploadingImage && <Progress value={imageUploadProgress} className="h-1.5" />}
          {imageUrl && !isUploadingImage && (
            <div className="rounded-lg border border-border/30 bg-secondary/10 p-2 overflow-hidden flex items-center gap-2">
              <img src={imageUrl} alt="Preview" className="rounded-lg max-h-20 object-contain" />
              <Button type="button" variant="ghost" size="icon" onClick={() => { setImageUrl(""); setUploadedImageName(""); }} className="h-6 w-6 text-muted-foreground hover:text-red-400 shrink-0">
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Placeholders:</span>
        <code className="rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-xs text-purple-400 font-mono">{"{{nome}}"}</code>
        <code className="rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-xs text-purple-400 font-mono">{"{{valor_conta}}"}</code>
      </div>

      {mediaType === "text" && (
        <div className="flex items-center gap-2 rounded-lg bg-green-500/5 border border-green-500/15 px-3 py-2">
          <Play className="w-3.5 h-3.5 text-green-400 shrink-0" />
          <p className="text-[11px] text-green-400/80">Ao enviar, simulará "digitando..." antes da mensagem</p>
        </div>
      )}

      <Button onClick={handleCreate} disabled={!canSave || isSaving || isUploading}
        className="gap-2 rounded-xl h-11 font-bold shadow-lg shadow-green-500/10 transition-all w-full sm:w-auto"
        style={{ background: "var(--gradient-green)" }}>
        <Plus className="w-4 h-4" /> Salvar Template
      </Button>
    </div>
  );
}