import { useState, useRef, useCallback } from "react";
import { loadOpusRecorder } from "@/lib/opusRecorderLoader";

// Usa opus-recorder para gerar OGG/Opus de verdade (não webm).
// Whapi/WhatsApp exige container OGG para messages/voice. Gravar direto em .ogg
// resolve os erros 500 que aconteciam quando enviávamos .webm.

export function useAudioRecorder(onSendAudio?: (base64: string) => Promise<void>) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [sending, setSending] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recorderRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const startRecording = useCallback(async () => {
    if (!onSendAudio) return;
    try {
      const Recorder = await loadRecorder();
      const recorder = new Recorder({
        encoderPath: "/opus/encoderWorker.min.js",
        encoderApplication: 2048, // VOIP
        encoderSampleRate: 16000,
        encoderFrameSize: 20,
        numberOfChannels: 1,
        streamPages: false,
        rawOpus: false, // queremos OGG container completo
      });

      recorder.ondataavailable = async (arrayBuffer: ArrayBuffer) => {
        // OGG/Opus completo
        const blob = new Blob([arrayBuffer], { type: "audio/ogg; codecs=opus" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const b64 = (reader.result as string).split(",")[1];
          if (b64) {
            setSending(true);
            try { await onSendAudio(b64); } catch {} finally { setSending(false); }
          }
        };
        reader.readAsDataURL(blob);
      };

      await recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((p) => p + 1), 1000);
    } catch (err) {
      console.error("[useAudioRecorder] start failed", err);
    }
  }, [onSendAudio]);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec) {
      try { rec.stop(); } catch {}
    }
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const cancelRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec) {
      try {
        rec.ondataavailable = null;
        rec.stop();
      } catch {}
    }
    recorderRef.current = null;
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  return { isRecording, recordingTime, sending, startRecording, stopRecording, cancelRecording, formatTime };
}
