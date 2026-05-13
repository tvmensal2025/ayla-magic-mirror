import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  onRecorded: (blob: Blob, durationSec: number) => Promise<void> | void;
  disabled?: boolean;
};

export function AudioRecorderInline({ onRecorded, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setPreviewBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
      };
      mrRef.current = mr;
      mr.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      console.error("mic error", e);
    }
  }

  function stop() {
    if (mrRef.current?.state === "recording") mrRef.current.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function discard() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setSeconds(0);
  }

  async function save() {
    if (!previewBlob) return;
    if (seconds < 3) {
      alert("Áudio muito curto (mínimo 3s).");
      return;
    }
    if (seconds > 90) {
      alert("Áudio muito longo (máximo 90s).");
      return;
    }
    setSaving(true);
    try {
      await onRecorded(previewBlob, seconds);
      discard();
    } finally {
      setSaving(false);
    }
  }

  if (previewUrl) {
    return (
      <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-muted/30">
        <audio src={previewUrl} controls className="w-full h-9" />
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar e ativar
          </Button>
          <Button size="sm" variant="outline" onClick={discard} disabled={saving}>
            <Trash2 className="w-4 h-4 mr-1" /> Regravar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant={recording ? "destructive" : "outline"}
      onClick={recording ? stop : start}
      disabled={disabled}
      className="gap-2"
    >
      {recording ? (
        <>
          <Square className="w-4 h-4" /> Gravando {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, "0")} — toque para parar
        </>
      ) : (
        <>
          <Mic className="w-4 h-4" /> Gravar o meu
        </>
      )}
    </Button>
  );
}
