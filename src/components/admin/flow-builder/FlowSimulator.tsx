import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Send, RotateCw, AlertTriangle, Mic, Image as ImageIcon, Video } from "lucide-react";
import { Step, getButtons, renderVarsPreview } from "./flowTypes";
import { simulateStep, type SimulationEvent } from "@/lib/flow-simulator/engine";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: Step[];
}

const PRESET_MESSAGES = [
  { id: "simular", label: "Quero simular" },
  { id: "duvida", label: "Tenho dúvida" },
  { id: "sem_conta", label: "Não tenho conta" },
  { id: "humano", label: "Falar com humano" },
  { id: "outra", label: "Outra coisa" },
];

const FAKE_LEAD = {
  nome: "João",
  valor_conta: "450,00",
  economia_range: "R$ 80 a R$ 90",
  telefone: "(11) 99999-8888",
  cpf: "123.456.789-00",
  representante: "Rafael",
  email: "joao@email.com",
};

export default function FlowSimulator({ open, onOpenChange, steps }: Props) {
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [history, setHistory] = useState<SimulationEvent[]>([]);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [freeText, setFreeText] = useState("");
  const [loopWarning, setLoopWarning] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    try {
      reset();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Falha ao carregar simulador");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  function reset() {
    setLoadError(null);
    setLoopWarning(null);
    setHistory([]);
    setVisited(new Set());
    const firstActive = steps.find((s) => s.is_active);
    if (!firstActive) {
      setLoadError("Nenhum passo ativo no fluxo");
      return;
    }
    setCurrentStepId(firstActive.id);
    pushBotEvent(firstActive.id);
  }

  function pushBotEvent(stepId: string) {
    const step = steps.find((s) => s.id === stepId);
    if (!step) return;
    setVisited((prev) => {
      const next = new Set(prev);
      next.add(stepId);
      return next;
    });
    setHistory((prev) => [
      ...prev,
      {
        type: "bot_step",
        stepId,
        stepKey: step.step_key || step.id,
        title: step.title,
        text: renderVarsPreview(step.message_text),
        slotKey: step.slot_key,
        buttons: getButtons(step),
        timestamp: Date.now(),
      },
    ]);
  }

  function pushLeadEvent(text: string) {
    setHistory((prev) => [
      ...prev,
      { type: "lead_message", text, timestamp: Date.now() },
    ]);
  }

  function pushSystemEvent(text: string) {
    setHistory((prev) => [
      ...prev,
      { type: "system", text, timestamp: Date.now() },
    ]);
  }

  function sendMessage(input: string, buttonId?: string) {
    if (!currentStepId) return;
    const trimmed = input.trim();
    if (!trimmed && !buttonId) {
      pushSystemEvent("⚠ Mensagem vazia");
      return;
    }
    pushLeadEvent(input || `[botão: ${buttonId}]`);

    const step = steps.find((s) => s.id === currentStepId);
    if (!step) return;

    const result = simulateStep({
      step,
      allSteps: steps,
      messageText: input,
      buttonId,
    });

    if (result.kind === "transition" && result.nextStepId) {
      // Detecta loop
      if (visited.has(result.nextStepId)) {
        setLoopWarning(
          `Loop detectado: ${step.title} → ${steps.find((s) => s.id === result.nextStepId)?.title || "passo"}`,
        );
      }
      setCurrentStepId(result.nextStepId);
      if (result.via) pushSystemEvent(`→ Transition: ${result.via}`);
      pushBotEvent(result.nextStepId);
    } else if (result.kind === "special") {
      pushSystemEvent(`→ Saída especial: ${result.special}`);
    } else if (result.kind === "fallback") {
      pushSystemEvent(`→ Fallback: ${result.fallbackMode}`);
      if (result.nextStepId) {
        if (visited.has(result.nextStepId)) {
          setLoopWarning(`Loop via fallback`);
        }
        setCurrentStepId(result.nextStepId);
        pushBotEvent(result.nextStepId);
      }
    } else if (result.kind === "missing_step") {
      pushSystemEvent(`⚠ Passo destino não existe (id=${result.missingId})`);
    }

    setFreeText("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>🎬 Simulador de Fluxo</DialogTitle>
          <DialogDescription>
            Teste o fluxo com um lead fake. Nenhuma mensagem é enviada via WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            {loadError}
            <Button size="sm" className="ml-2" onClick={reset}>Tentar novamente</Button>
          </div>
        ) : (
          <>
            {loopWarning && (
              <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {loopWarning}
              </div>
            )}

            {/* Histórico */}
            <div ref={scrollRef} className="max-h-[360px] space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3">
              {history.length === 0 && (
                <p className="text-center text-xs text-muted-foreground">Iniciando simulação…</p>
              )}
              {history.map((ev, i) => {
                if (ev.type === "bot_step") {
                  return (
                    <Card key={i} className="bg-emerald-500/10 p-2 text-[12px]">
                      <div className="mb-1 flex items-center gap-1">
                        <Badge variant="outline" className="text-[9px]">{ev.stepKey}</Badge>
                        <span className="font-semibold">{ev.title}</span>
                      </div>
                      {ev.slotKey && (
                        <div className="mb-1 flex gap-1 text-[10px] text-muted-foreground">
                          <Mic className="h-3 w-3" /> Áudio · <ImageIcon className="h-3 w-3" /> Imagem · <Video className="h-3 w-3" /> Vídeo
                          (slot: {ev.slotKey})
                        </div>
                      )}
                      {ev.text && <p className="whitespace-pre-wrap">{ev.text}</p>}
                      {ev.buttons && ev.buttons.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {ev.buttons.map((b) => (
                            <Button
                              key={b.id}
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px]"
                              onClick={() => sendMessage(b.title, b.id)}
                            >
                              {b.title}
                            </Button>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                }
                if (ev.type === "lead_message") {
                  return (
                    <div key={i} className="ml-12 rounded-md bg-blue-500/10 p-2 text-right text-[12px]">
                      <span className="text-[9px] text-muted-foreground">Lead</span>
                      <p className="break-words">{ev.text}</p>
                    </div>
                  );
                }
                return (
                  <p key={i} className="text-center text-[10px] italic text-muted-foreground">
                    {ev.text}
                  </p>
                );
              })}
            </div>

            {/* Mensagens pré-definidas */}
            <div className="flex flex-wrap gap-1.5">
              {PRESET_MESSAGES.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => sendMessage(p.label)}
                  className="h-7 text-[11px]"
                >
                  {p.label}
                </Button>
              ))}
            </div>

            {/* Input livre */}
            <div className="flex gap-2">
              <Input
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && freeText.trim()) {
                    sendMessage(freeText);
                  }
                }}
                placeholder="Digite uma mensagem livre…"
                maxLength={1000}
              />
              <Button onClick={() => sendMessage(freeText)} disabled={!freeText.trim()}>
                <Send className="h-3 w-3" />
              </Button>
              <Button variant="outline" onClick={reset} title="Reiniciar">
                <RotateCw className="h-3 w-3" />
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
