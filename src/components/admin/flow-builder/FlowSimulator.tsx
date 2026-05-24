import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Send, RotateCw, AlertTriangle, Loader2 } from "lucide-react";
import { Step, getButtons, renderVarsPreview, isAiAnswerStep } from "./flowTypes";
import { simulateStep } from "@/lib/flow-simulator/engine";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: Step[];
  consultantId?: string | null;
  consultantName?: string | null;
}

type MediaEv =
  | { kind: "audio"; url: string; duration?: number; key: string }
  | { kind: "image"; url: string; caption?: string; key: string }
  | { kind: "video"; url: string; key: string }
  | { kind: "text"; body: string; key: string }
  | { kind: "buttons"; items: { id: string; title: string }[]; key: string }
  | { kind: "system"; text: string; key: string }
  | { kind: "lead"; text: string; key: string }
  | { kind: "ai_typing"; key: string }
  | { kind: "ai_reply"; body: string; key: string };

const PRESET_MESSAGES = [
  "Quero simular",
  "Tenho dúvida",
  "Não tenho conta",
  "Falar com humano",
  "Outra coisa",
];

let _evCounter = 0;
const newKey = () => `ev_${Date.now()}_${++_evCounter}`;

export default function FlowSimulator({
  open,
  onOpenChange,
  steps,
  consultantId,
  consultantName,
}: Props) {
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [events, setEvents] = useState<MediaEv[]>([]);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [freeText, setFreeText] = useState("");
  const [loopWarning, setLoopWarning] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const aiHistoryRef = useRef<Array<{ role: string; content: string }>>([]);

  const activeSteps = useMemo(() => steps.filter((s) => s.is_active), [steps]);

  useEffect(() => {
    if (!open) return;
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  function reset() {
    setLoadError(null);
    setLoopWarning(null);
    setEvents([]);
    setVisited(new Set());
    aiHistoryRef.current = [];
    const first = activeSteps[0];
    if (!first) {
      setLoadError("Nenhum passo ativo no fluxo.");
      setCurrentStepId(null);
      return;
    }
    setCurrentStepId(first.id);
    void renderStep(first.id, true);
  }

  function append(ev: MediaEv) {
    setEvents((prev) => [...prev, ev]);
  }

  async function fetchMedia(slotKey: string | null) {
    if (!slotKey || !consultantId) return [];
    try {
      const { data, error } = await supabase.functions.invoke("flow-simulate", {
        body: { action: "media", consultant_id: consultantId, slot_key: slotKey },
      });
      if (error) throw error;
      return (data as any)?.media || [];
    } catch (e) {
      console.warn("[simulator] media fetch failed", e);
      return [];
    }
  }

  async function renderStep(stepId: string, isFirst = false) {
    const step = stepsRef.current.find((s) => s.id === stepId);
    if (!step) return;

    setVisited((prev) => {
      if (prev.has(stepId) && !isFirst) {
        setLoopWarning(`Loop detectado em "${step.title}"`);
      }
      const next = new Set(prev);
      next.add(stepId);
      return next;
    });

    append({
      kind: "system",
      key: newKey(),
      text: `▶ ${step.step_key || step.id} · ${step.title}`,
    });

    // 1) Mídia real do slot
    if (step.slot_key) {
      const media = await fetchMedia(step.slot_key);
      // Ordem do real: text → audio → video → image (humanPace ~2,2s + 55ms/char)
      const byKind = (k: string) => media.filter((m: any) => m.kind === k);
      const text = renderVarsPreview(step.message_text || "");
      if (text) {
        await sleep(800);
        append({ kind: "text", body: text, key: newKey() });
        aiHistoryRef.current.push({ role: "assistant", content: text });
      }
      for (const a of byKind("audio")) {
        await sleep(700);
        append({ kind: "audio", url: a.url, duration: a.duration_sec, key: newKey() });
      }
      for (const v of byKind("video")) {
        await sleep(700);
        append({ kind: "video", url: v.url, key: newKey() });
      }
      for (const img of byKind("image")) {
        await sleep(700);
        append({ kind: "image", url: img.url, caption: img.label || "", key: newKey() });
      }
    } else {
      const text = renderVarsPreview(step.message_text || "");
      if (text) {
        await sleep(400);
        append({ kind: "text", body: text, key: newKey() });
        aiHistoryRef.current.push({ role: "assistant", content: text });
      }
    }

    // 2) Botões
    const buttons = getButtons(step);
    if (buttons.length > 0) {
      append({ kind: "buttons", items: buttons, key: newKey() });
    }
  }

  async function handleLeadInput(text: string, buttonId?: string) {
    if (!currentStepId) return;
    const trimmed = text.trim();
    if (!trimmed && !buttonId) return;
    const display = trimmed || buttonId || "";
    append({ kind: "lead", text: display, key: newKey() });
    aiHistoryRef.current.push({ role: "user", content: display });
    setFreeText("");
    setBusy(true);

    try {
      const step = stepsRef.current.find((s) => s.id === currentStepId);
      if (!step) return;

      const result = simulateStep({
        step,
        allSteps: stepsRef.current,
        messageText: trimmed,
        buttonId,
      });

      if (result.kind === "transition" && result.nextStepId) {
        append({ kind: "system", key: newKey(), text: `→ ${result.via}` });
        setCurrentStepId(result.nextStepId);
        await renderStep(result.nextStepId);
      } else if (result.kind === "special") {
        append({ kind: "system", key: newKey(), text: `→ Saída: ${result.special}` });
      } else if (result.kind === "fallback") {
        // IA livre real
        if ((result.fallbackMode === "ai" || result.fallbackMode === "ai_limit" || isAiAnswerStep(step)) && aiEnabled) {
          append({ kind: "ai_typing", key: newKey() });
          try {
            const { data, error } = await supabase.functions.invoke("flow-simulate", {
              body: {
                action: "ai",
                consultant_id: consultantId,
                consultant_name: consultantName,
                prompt: (step.fallback as any)?.ai_prompt || step.message_text || "",
                user_message: trimmed || display,
                history: aiHistoryRef.current.slice(-8),
              },
            });
            // remove typing
            setEvents((prev) => prev.filter((e) => e.kind !== "ai_typing"));
            if (error) throw error;
            const reply = (data as any)?.reply || "(sem resposta da IA)";
            append({ kind: "ai_reply", body: reply, key: newKey() });
            aiHistoryRef.current.push({ role: "assistant", content: reply });
          } catch (e) {
            setEvents((prev) => prev.filter((e) => e.kind !== "ai_typing"));
            append({
              kind: "system",
              key: newKey(),
              text: `⚠ Erro IA: ${(e as Error).message}`,
            });
          }
        } else if (result.fallbackMode === "repeat" || result.nextStepId === step.id) {
          append({ kind: "system", key: newKey(), text: "→ Repetindo passo" });
          await renderStep(step.id);
        } else if (result.nextStepId) {
          append({ kind: "system", key: newKey(), text: "→ Fallback goto" });
          setCurrentStepId(result.nextStepId);
          await renderStep(result.nextStepId);
        } else {
          append({ kind: "system", key: newKey(), text: `→ Fallback: ${result.fallbackMode}` });
        }
      } else if (result.kind === "missing_step") {
        append({ kind: "system", key: newKey(), text: `⚠ Passo destino inexistente (${result.missingId})` });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>🎬 Simulador de Fluxo — modo real</DialogTitle>
          <DialogDescription>
            Mídia real do MinIO + IA real (Gemini). Nada é enviado pelo WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} id="ai-real" />
            <label htmlFor="ai-real" className="cursor-pointer">
              IA real (consome créditos)
            </label>
          </div>
          <Button size="sm" variant="outline" onClick={reset} disabled={busy}>
            <RotateCw className="mr-1 h-3 w-3" />
            Zerar conversa
          </Button>
        </div>

        {loadError && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            {loadError}
          </div>
        )}

        {loopWarning && (
          <div className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            {loopWarning}
          </div>
        )}

        {/* Chat */}
        <div
          ref={scrollRef}
          className="max-h-[460px] min-h-[300px] space-y-2 overflow-y-auto rounded-md border bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><rect width=%2240%22 height=%2240%22 fill=%22%23ece5dd%22/></svg>')] p-3 dark:bg-muted/30"
        >
          {events.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">Iniciando…</p>
          )}
          {events.map((ev) => {
            if (ev.kind === "system") {
              return (
                <p key={ev.key} className="text-center text-[10px] italic text-muted-foreground">
                  {ev.text}
                </p>
              );
            }
            if (ev.kind === "lead") {
              return (
                <div key={ev.key} className="flex justify-end">
                  <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-emerald-500/90 px-3 py-1.5 text-sm text-white shadow">
                    {ev.text}
                  </div>
                </div>
              );
            }
            if (ev.kind === "ai_typing") {
              return (
                <div key={ev.key} className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-xs text-muted-foreground shadow dark:bg-card">
                    <Loader2 className="h-3 w-3 animate-spin" /> IA digitando…
                  </div>
                </div>
              );
            }
            if (ev.kind === "ai_reply") {
              return (
                <div key={ev.key} className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm shadow dark:bg-card">
                    <Badge variant="outline" className="mb-1 text-[9px]">IA</Badge>
                    <p className="whitespace-pre-wrap">{ev.body}</p>
                  </div>
                </div>
              );
            }
            if (ev.kind === "text") {
              return (
                <div key={ev.key} className="flex justify-start">
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm shadow dark:bg-card">
                    {ev.body}
                  </div>
                </div>
              );
            }
            if (ev.kind === "audio") {
              return (
                <div key={ev.key} className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-sm bg-white p-2 shadow dark:bg-card">
                    <audio controls src={ev.url} className="h-8 w-64" />
                    {ev.duration ? (
                      <p className="mt-0.5 text-[9px] text-muted-foreground">{ev.duration}s</p>
                    ) : null}
                  </div>
                </div>
              );
            }
            if (ev.kind === "image") {
              return (
                <div key={ev.key} className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-sm bg-white p-1 shadow dark:bg-card">
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
                  <div className="rounded-2xl rounded-tl-sm bg-white p-1 shadow dark:bg-card">
                    <video
                      src={ev.url}
                      controls
                      playsInline
                      className="max-h-72 max-w-xs rounded-xl"
                    />
                  </div>
                </div>
              );
            }
            if (ev.kind === "buttons") {
              return (
                <div key={ev.key} className="flex flex-wrap justify-start gap-1.5">
                  {ev.items.map((b) => (
                    <Button
                      key={b.id}
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full bg-white text-xs dark:bg-card"
                      disabled={busy}
                      onClick={() => handleLeadInput(b.title, b.id)}
                    >
                      {b.title}
                    </Button>
                  ))}
                </div>
              );
            }
            return null;
          })}
        </div>

        {/* Presets */}
        <div className="flex flex-wrap gap-1.5">
          {PRESET_MESSAGES.map((p) => (
            <Button
              key={p}
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => handleLeadInput(p)}
              className="h-7 text-[11px]"
            >
              {p}
            </Button>
          ))}
        </div>

        {/* Input livre */}
        <div className="flex gap-2">
          <Input
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && freeText.trim() && !busy) handleLeadInput(freeText);
            }}
            placeholder="Digite uma mensagem livre…"
            maxLength={1000}
            disabled={busy}
          />
          <Button
            onClick={() => handleLeadInput(freeText)}
            disabled={!freeText.trim() || busy}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
