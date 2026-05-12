import { useState, useCallback, useEffect } from "react";
import { Check, CheckCheck, Clock, FileText, Image, Mic, Video, Play, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/hooks/useMessages";

interface MessageBubbleProps {
  message: ChatMessage;
  onLoadMedia?: (messageId: string) => Promise<string | null>;
}

function formatTime(ts: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusIcon({ status }: { status?: number }) {
  if (status === undefined || status === null) return null;
  if (status <= 1) return <Clock className="h-3 w-3 text-muted-foreground" />;
  if (status === 2) return <Check className="h-3 w-3 text-muted-foreground" />;
  if (status === 3) return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
  if (status >= 4) return <CheckCheck className="h-3 w-3 text-primary" />;
  return null;
}

function isAccessibleUrl(url?: string): boolean {
  if (!url) return false;
  if (url.startsWith("data:")) return true;
  if (url.startsWith("http") && !url.includes("mmg.whatsapp.net") && !url.includes("media-gru")) return true;
  return false;
}

function AudioPlayer({ message, onLoadMedia }: { message: ChatMessage; onLoadMedia?: (id: string) => Promise<string | null> }) {
  const [audioSrc, setAudioSrc] = useState<string | null>(
    isAccessibleUrl(message.mediaUrl) ? message.mediaUrl! : null
  );
  const [loading, setLoading] = useState(false);

  const handleLoad = useCallback(async () => {
    if (audioSrc || !onLoadMedia) return;
    setLoading(true);
    const src = await onLoadMedia(message.id);
    if (src) setAudioSrc(src);
    setLoading(false);
  }, [audioSrc, onLoadMedia, message.id]);

  useEffect(() => {
    if (!audioSrc && onLoadMedia) {
      handleLoad();
    }
  }, []);

  if (audioSrc) {
    return (
      <audio controls className="max-w-full h-10" preload="auto">
        <source src={audioSrc} type={message.mediaMimetype || "audio/ogg"} />
      </audio>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-2 text-xs h-8"
      onClick={handleLoad}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Play className="h-4 w-4" />
      )}
      <Mic className="h-3.5 w-3.5" />
      Áudio
    </Button>
  );
}

function ImageViewer({ message, onLoadMedia }: { message: ChatMessage; onLoadMedia?: (id: string) => Promise<string | null> }) {
  const [imgSrc, setImgSrc] = useState<string | null>(
    isAccessibleUrl(message.mediaUrl) ? message.mediaUrl! : null
  );
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loadAttempted, setLoadAttempted] = useState(false);

  const handleLoad = useCallback(async () => {
    if (imgSrc || !onLoadMedia || loadAttempted) return;
    setLoadAttempted(true);
    setLoading(true);
    const src = await onLoadMedia(message.id);
    if (src) setImgSrc(src);
    setLoading(false);
  }, [imgSrc, onLoadMedia, message.id, loadAttempted]);

  useEffect(() => {
    if (!imgSrc && onLoadMedia) {
      handleLoad();
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando imagem...
      </div>
    );
  }

  if (imgSrc) {
    return (
      <>
        <img
          src={imgSrc}
          alt={message.mediaCaption || "imagem"}
          className="rounded max-w-full max-h-60 mb-1 cursor-pointer hover:opacity-90 transition-opacity"
          loading="lazy"
          onClick={() => setExpanded(true)}
        />
        {expanded && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
            onClick={() => setExpanded(false)}
          >
            <img src={imgSrc} alt="" className="max-w-[90vw] max-h-[90vh] rounded-lg" />
          </div>
        )}
      </>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-2 text-xs h-8"
      onClick={handleLoad}
      disabled={loading}
    >
      <Image className="h-4 w-4" />
      📷 Carregar imagem
    </Button>
  );
}

function VideoPlayer({ message, onLoadMedia }: { message: ChatMessage; onLoadMedia?: (id: string) => Promise<string | null> }) {
  const [videoSrc, setVideoSrc] = useState<string | null>(
    isAccessibleUrl(message.mediaUrl) ? message.mediaUrl! : null
  );
  const [loading, setLoading] = useState(false);

  const handleLoad = useCallback(async () => {
    if (videoSrc || !onLoadMedia) return;
    setLoading(true);
    const src = await onLoadMedia(message.id);
    if (src) setVideoSrc(src);
    setLoading(false);
  }, [videoSrc, onLoadMedia, message.id]);

  useEffect(() => {
    if (!videoSrc && onLoadMedia) {
      handleLoad();
    }
  }, []);

  if (videoSrc) {
    return (
      <video controls className="rounded max-w-full max-h-60 mb-1" preload="metadata">
        <source src={videoSrc} type={message.mediaMimetype || "video/mp4"} />
      </video>
    );
  }

  return (
    <Button variant="ghost" size="sm" className="gap-2 text-xs h-8" onClick={handleLoad} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
      🎥 Carregar vídeo
    </Button>
  );
}

function DocumentViewer({ message, onLoadMedia }: { message: ChatMessage; onLoadMedia?: (id: string) => Promise<string | null> }) {
  const [docSrc, setDocSrc] = useState<string | null>(
    isAccessibleUrl(message.mediaUrl) ? message.mediaUrl! : null
  );
  const [loading, setLoading] = useState(false);
  const isPdf = message.mediaMimetype?.includes("pdf") || message.fileName?.endsWith(".pdf");

  const handleLoad = useCallback(async () => {
    if (docSrc || !onLoadMedia) return;
    setLoading(true);
    const src = await onLoadMedia(message.id);
    if (src) setDocSrc(src);
    setLoading(false);
  }, [docSrc, onLoadMedia, message.id]);

  useEffect(() => {
    if (!docSrc && onLoadMedia) {
      handleLoad();
    }
  }, []);

  if (docSrc && isPdf) {
    return (
      <div className="space-y-1">
        <iframe
          src={docSrc}
          className="w-full h-48 rounded border border-border bg-background"
          title={message.fileName || "PDF"}
        />
        <a href={docSrc} download={message.fileName || "documento.pdf"} className="text-[10px] text-primary hover:underline flex items-center gap-1">
          <Download className="h-3 w-3" />
          Baixar {message.fileName || "documento.pdf"}
        </a>
      </div>
    );
  }

  if (docSrc) {
    return (
      <a href={docSrc} download={message.fileName || "documento"} className="flex items-center gap-2 text-xs text-primary hover:underline">
        <Download className="h-4 w-4" />
        Baixar {message.fileName || "documento"}
      </a>
    );
  }

  return (
    <Button variant="ghost" size="sm" className="gap-2 text-xs h-8" onClick={handleLoad} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      📄 {message.fileName || "Documento"}
    </Button>
  );
}

function StickerViewer({ message, onLoadMedia }: { message: ChatMessage; onLoadMedia?: (id: string) => Promise<string | null> }) {
  const [src, setSrc] = useState<string | null>(
    isAccessibleUrl(message.mediaUrl) ? message.mediaUrl! : null
  );
  const [loading, setLoading] = useState(false);

  const handleLoad = useCallback(async () => {
    if (src || !onLoadMedia) return;
    setLoading(true);
    const result = await onLoadMedia(message.id);
    if (result) setSrc(result);
    setLoading(false);
  }, [src, onLoadMedia, message.id]);

  useEffect(() => {
    if (!src && onLoadMedia) {
      handleLoad();
    }
  }, []);

  if (src) {
    return <img src={src} alt="sticker" className="max-w-[150px] max-h-[150px]" />;
  }

  return (
    <Button variant="ghost" size="sm" className="gap-1 text-xs h-8" onClick={handleLoad} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "🏷️"} Sticker
    </Button>
  );
}

function LinkifiedText({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:opacity-80 break-all"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

export function MessageBubble({ message, onLoadMedia }: MessageBubbleProps) {
  const { fromMe, text, timestamp, status, mediaType } = message;
  const hasMedia = !!mediaType;
  const showText = text && mediaType !== "audio" && mediaType !== "sticker";

  return (
    <div className={`flex ${fromMe ? "justify-end" : "justify-start"} mb-1`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-1.5 ${
          fromMe
            ? "bg-primary/20 text-foreground rounded-br-none"
            : "bg-secondary text-foreground rounded-bl-none"
        }`}
      >
        {mediaType === "image" && <ImageViewer message={message} onLoadMedia={onLoadMedia} />}
        {mediaType === "video" && <VideoPlayer message={message} onLoadMedia={onLoadMedia} />}
        {mediaType === "audio" && <AudioPlayer message={message} onLoadMedia={onLoadMedia} />}
        {mediaType === "document" && <DocumentViewer message={message} onLoadMedia={onLoadMedia} />}
        {mediaType === "sticker" && <StickerViewer message={message} onLoadMedia={onLoadMedia} />}

        {showText && <LinkifiedText text={text} />}

        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className="text-[10px] text-muted-foreground">{formatTime(timestamp)}</span>
          {fromMe && <StatusIcon status={status} />}
        </div>
      </div>
    </div>
  );
}
