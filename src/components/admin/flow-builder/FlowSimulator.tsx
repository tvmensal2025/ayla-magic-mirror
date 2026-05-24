import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, RotateCw, AlertTriangle, Loader2, Paperclip } from "lucide-react";
import { Step } from "./flowTypes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: Step[];
  consultantId?: string | null;
  consultantName?: string | null;
}

type Ev =
  | { kind: "text"; text: string; key: string }
  | { kind: "buttons"; text: string; buttons: { id: string; title: string }[]; key: string }
  | { kind: "audio"; url: string; key: string }
  | { kind: "image"; url: string; caption?: string; key: string }
  | { kind: "video"; url: string; caption?: string; key: string }
  | { kind: "document"; url: string; caption?: string; key: string }
  | { kind: "presence"; state: string; key: string }
  | { kind: "lead"; text: string; attach?: { url: string; kind: string }; key: string }
  | { kind: "system"; text: string; key: string };

const VARIANTS: Array<"A" | "B" | "C" | "D"> = ["A", "B", "C", "D"];
let _ctr = 0;
const k = () => `ev_${Date.now()}_${++_ctr}`;

export default function FlowSimulator({ open, onOpenChange, consultantId }: Props) {
  const [events, setEvents] = useState<Ev[]>([]);
  const [freeText, setFreeText] = useState("");
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState<"A" | "B" | "C" | "D">("A");
  const [state, setState] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) handleReset(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  function appendEvents(incoming: any[]) {
    setEvents((prev) => [...prev, ...incoming.map((e) => ({ ...e, key: k() }))]);
  }

  async function callRun(payload: any) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("flow-simulate-run", {
        body: { consultant_id: consultantId, variant, ...payload },
      });
      if (error) throw error;
      const out = data as { events?: any[]; customer_state?: any };
      appendEvents(out.events || []);
      if (out.customer_state) setState(out.customer_state);
    } catch (e) {
      toast.error("Erro no simulador: " + (e as Error).message);
      setEvents((prev) => [...prev, { kind: "system", text: `⚠ ${(e as Error).message}`, key: k() }]);
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(initial = false) {
    setEvents([]);
    setState(null);
    if (!consultantId) return;
    setBusy(true);
    try {
      await supabase.functions.invoke("flow-simulate-reset", {
        body: { consultant_id: consultantId },
      });
    } catch (_) { /* noop */ }
    setBusy(false);
    if (initial) {
      // Dispara o motor com "oi" + fresh=true → reseta sandbox e roda welcome
      await callRun({ user_message: "oi", fresh: true });
      setEvents((prev) => [{ kind: "system", text: "▶ Conversa zerada — começando do início", key: k() }, ...prev]);
    }
  }

  async function handleSend(text: string, button_id?: string) {
    const trimmed = text.trim();
    if (!trimmed && !button_id) return;
    setEvents((prev) => [...prev, { kind: "lead", text: trimmed || (button_id || ""), key: k() }]);
    setFreeText("");
    await callRun({ user_message: trimmed, button_id });
  }

  async function handleFile(file: File) {
    if (!consultantId) return;
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${consultantId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("simulator-uploads")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("simulator-uploads").getPublicUrl(path);
      const url = pub.publicUrl;
      const kind: "image" | "document" = file.type.startsWith("image/") ? "image" : "document";
      setEvents((prev) => [
        ...prev,
        { kind: "lead", text: kind === "image" ? "📷 Foto enviada" : "📄 Documento enviado", attach: { url, kind }, key: k() },
      ]);
      await callRun({ attach: { url, kind }, user_message: "" });
    } catch (e) {
      toast.error("Falha no upload: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>🎬 Simulador de Fluxo — motor real de produção</DialogTitle>
          <DialogDescription>
            Roda o mesmo runBotFlow/runConversationalFlow da produção num customer sandbox.
            Nada toca o CRM, métricas, alertas ou WhatsApp real.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Variante:</span>
            {VARIANTS.map((v) => (
              <Button
                key={v}
                size="sm"
                variant={variant === v ? "default" : "outline"}
                onClick={() => setVariant(v)}
                disabled={busy}
                className="h-6 px-2 text-[10px]"
              >
                {v}
              </Button>
            ))}
            {state?.conversation_step && (
              <Badge variant="outline" className="ml-2 text-[9px]">
                step: {state.conversation_step}
              </Badge>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => handleReset(true)} disabled={busy}>
            <RotateCw className="mr-1 h-3 w-3" /> Zerar
          </Button>
        </div>

        <div
          ref={scrollRef}
          className="max-h-[460px] min-h-[300px] space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-3"
        >
          {events.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">
              {busy ? <Loader2 className="inline h-3 w-3 animate-spin" /> : "Aguardando…"}
            </p>
          )}
          {events.map((ev) => {
            if (ev.kind === "system") {
              return (
                <p key={ev.key} className="text-center text-[10px] italic text-muted-foreground">
                  {ev.text}
                </p>
              );
            }
            if (ev.kind === "presence") {
              return (
                <p key={ev.key} className="text-[10px] text-muted-foreground">
                  ▸ {ev.state === "recording" ? "🎤 gravando áudio…" : "✍️ digitando…"}
                </p>
              );
            }
            if (ev.kind === "lead") {
              return (
                <div key={ev.key} className="flex justify-end">
                  <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-emerald-500/90 px-3 py-1.5 text-sm text-white shadow">
                    {ev.attach?.kind === "image" ? (
                      <img src={ev.attach.url} className="max-h-40 rounded-lg" />
                    ) : ev.attach ? (
                      <a href={ev.attach.url} target="_blank" rel="noreferrer" className="underline">
                        {ev.text}
                      </a>
                    ) : (
                      ev.text
                    )}
                  </div>
                </div>
              );
            }
            if (ev.kind === "text" || ev.kind === "buttons") {
              return (
                <div key={ev.key} className="flex justify-start">
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-card px-3 py-2 text-sm shadow">
                    {ev.text}
                    {ev.kind === "buttons" && ev.buttons.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ev.buttons.map((b) => (
                          <Button
                            key={b.id}
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            className="h-7 rounded-full text-xs"
                            onClick={() => handleSend(b.title, b.id)}
                          >
                            {b.title}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            if (ev.kind === "audio") {
              return (
                <div key={ev.key} className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-sm bg-card p-2 shadow">
                    <audio controls src={ev.url} className="h-8 w-64" />
                  </div>
                </div>
              );
            }
            if (ev.kind === "image") {
              return (
                <div key={ev.key} className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-sm bg-card p-1 shadow">
                    <img
                      src={ev.url}
                      alt={ev.caption || ""}
                      className="max-h-64 max-w-xs cursor-zoom-in rounded-xl"
                      onClick={() => window.open(ev.url, "_blank")}
                    />
                    {ev.caption && <p className="px-2 py-1 text-xs">{ev.caption}</p>}
                  </div>
                </div>
              );
            }
            if (ev.kind === "video") {
              return (
                <div key={ev.key} className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-sm bg-card p-1 shadow">
                    <video src={ev.url} controls playsInline className="max-h-72 max-w-xs rounded-xl" />
                  </div>
                </div>
              );
            }
            if (ev.kind === "document") {
              return (
                <div key={ev.key} className="flex justify-start">
                  <a
                    href={ev.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl rounded-tl-sm bg-card px-3 py-2 text-sm underline shadow"
                  >
                    📄 {ev.caption || "Documento"}
                  </a>
                </div>
              );
            }
            return null;
          })}
          {busy && <p className="text-center text-[10px] text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> processando…</p>}
        </div>

        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.currentTarget.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            title="Anexar foto da conta ou documento (PDF/JPG)"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Input
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && freeText.trim() && !busy) handleSend(freeText);
            }}
            placeholder="Digite uma mensagem livre…"
            maxLength={1000}
            disabled={busy}
          />
          <Button onClick={() => handleSend(freeText)} disabled={!freeText.trim() || busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </Button>
        </div>

        <p className="flex items-start gap-1 text-[10px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          Conversa sandbox — não polui CRM, métricas nem envia WhatsApp real. Use o anexo (📎) para mandar uma foto da conta de luz ou documento (PDF/JPG) e ver o OCR rodando de verdade.
        </p>
      </DialogContent>
    </Dialog>
  );
}
