import { useState, useEffect, useRef, useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CaptureStepsList } from "./CaptureStepsList";
import { CaptureLeadCard } from "./CaptureLeadCard";
import { CaptureProgressBar } from "./CaptureProgressBar";
import { SendSequenceDialog, type SequenceStep } from "./SendSequenceDialog";
import { useCaptureSession, CAPTURE_FIELDS } from "@/hooks/useCaptureSession";
import { useCaptureScoreboard } from "@/hooks/useCaptureScoreboard";
import { fireRandomCelebration, MOTIVATIONAL_PHRASES } from "@/lib/captureGame";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { X, Gamepad2, ListChecks, IdCard, Loader2, Trophy, ChevronDown, ChevronUp, Maximize2, Minimize2, UserPlus, Zap } from "lucide-react";
import { askLeadName } from "@/lib/whatsapp/send";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  consultantId: string;
  customerId: string;
  customerName?: string | null;
  phoneNumber?: string | null;
}

export function CaptureSheet({ open, onOpenChange, consultantId, customerId, customerName, phoneNumber }: Props) {
  const { customer, filledCount, totalFields, progress } = useCaptureSession(customerId);
  const { bump } = useCaptureScoreboard(consultantId);
  const { toast } = useToast();
  const [sentSteps, setSentSteps] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"passos" | "ficha">("passos");
  const [submitting, setSubmitting] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [allSteps, setAllSteps] = useState<SequenceStep[]>([]);
  const [seqOpen, setSeqOpen] = useState(false);
  const lastCountRef = useRef(0);

  useEffect(() => { setSentSteps(new Set()); setMinimized(false); setExpanded(false); }, [customerId]);
  useEffect(() => { if (!open) { setMinimized(false); setExpanded(false); } }, [open]);

  // Garante modo manual ao abrir
  useEffect(() => {
    if (!open || !customer) return;
    if (customer.capture_mode !== "manual") {
      void supabase.from("customers")
        .update({ capture_mode: "manual", capture_started_at: new Date().toISOString() })
        .eq("id", customer.id);
    }
  }, [open, customer]);

  useEffect(() => {
    if (!customer) return;
    if (filledCount > lastCountRef.current) {
      const phrase = MOTIVATIONAL_PHRASES[filledCount];
      if (phrase) toast({ title: phrase, duration: 1800 });
    }
    lastCountRef.current = filledCount;
  }, [filledCount, customer, toast]);

  const canSubmit = filledCount === totalFields;
  const phrase = MOTIVATIONAL_PHRASES[filledCount] || `Faltam ${totalFields - filledCount} dados 💪`;
  const nextMissing = CAPTURE_FIELDS.find((f) => {
    const v = (customer as any)?.[f.key];
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && !v.trim()) return true;
    if (f.key === "electricity_bill_value" && Number(v) <= 0) return true;
    return false;
  });

  const handleSubmit = async () => {
    if (!customer || !canSubmit) return;
    setSubmitting(true);
    try {
      await supabase.from("customers").update({
        conversation_step: "finalizando",
        capture_mode: "auto",
      }).eq("id", customer.id);
      fireRandomCelebration();
      await bump();
      toast({ title: "🎉 Cadastro enviado!", description: "Portal Worker concluindo…", duration: 3500 });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const disableCapture = async () => {
    await supabase.from("customers").update({ capture_mode: "auto" }).eq("id", customerId);
    toast({ title: "Modo Captação desligado" });
    onOpenChange(false);
  };

  const [askingName, setAskingName] = useState(false);
  const needsName = !customer?.name_source || String(customer.name_source).toLowerCase() === "unknown";
  const handleAskName = async () => {
    if (!customer) return;
    setAskingName(true);
    try {
      await askLeadName({ consultantId, customerId: customer.id, phoneHint: phoneNumber || undefined });
    } finally {
      setAskingName(false);
    }
  };

  // Barra minimizada — flutua no rodapé sem bloquear o input do chat
  if (open && minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 h-11 rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/40 border border-primary/60 backdrop-blur animate-in slide-in-from-bottom-2"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <Gamepad2 className="w-4 h-4" />
        <span className="text-xs font-bold">
          Captação {filledCount}/{totalFields}
        </span>
        <span className="text-[10px] opacity-80">· {sentSteps.size}/10 passos</span>
        <ChevronUp className="w-4 h-4" />
      </button>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideCloseButton
        overlayClassName={expanded ? undefined : "bg-transparent pointer-events-none"}
        onInteractOutside={(e) => { if (!expanded) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (!expanded) e.preventDefault(); }}
        className={`w-full p-0 flex flex-col gap-0 border-0 bg-background sm:max-w-none shadow-[0_-12px_40px_-12px_hsl(var(--primary)/0.35)] ${
          expanded
            ? "h-[100dvh] rounded-none"
            : "h-[52dvh] min-h-[380px] max-h-[100dvh] rounded-t-2xl"
        }`}
      >
        {/* Grabber */}
        {!expanded && (
          <div className="flex justify-center pt-1.5 pb-0.5 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/40" />
          </div>
        )}

        {/* Header */}
        <header className={`px-3 border-b border-border/60 bg-gradient-to-br from-primary/10 via-card to-card sticky top-0 z-20 ${expanded ? "pt-3 pb-2" : "pt-1.5 pb-1.5"}`}>
          <div className={`flex items-center gap-1.5 ${expanded ? "mb-2" : "mb-1.5"}`}>
            <div className={`rounded-full bg-primary/15 flex items-center justify-center shrink-0 ${expanded ? "w-9 h-9" : "w-7 h-7"}`}>
              <Gamepad2 className={`text-primary ${expanded ? "w-4 h-4" : "w-3.5 h-3.5"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-bold truncate ${expanded ? "text-sm" : "text-xs"}`}>{customerName || phoneNumber || "Lead"}</p>
              {expanded && <p className="text-[10px] text-muted-foreground truncate">{phoneNumber}</p>}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setExpanded((v) => !v)}
                title={expanded ? "Recolher (ver chat)" : "Expandir tela cheia"}
              >
                {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setMinimized(true)}
                title="Minimizar (liberar input do chat)"
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onOpenChange(false)} title="Fechar">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <CaptureProgressBar progress={progress} filled={filledCount} total={totalFields} />
          <p className={`text-[11px] text-center font-semibold text-primary/90 ${expanded ? "mt-1.5" : "mt-1"}`}>{phrase}</p>
          {expanded && nextMissing && !canSubmit && (
            <p className="text-[11px] text-center mt-0.5 text-muted-foreground">
              🎯 Próximo: <span className="font-bold text-foreground">{nextMissing.label}</span>
            </p>
          )}
          {expanded && (
            <p className="text-[10px] text-center mt-0.5 text-muted-foreground">
              Passo {sentSteps.size} de 10 enviado
            </p>
          )}
          {needsName && (
            <div className="mt-1.5 flex items-center justify-center">
              <Button
                size="sm"
                variant="default"
                className="h-7 text-[11px] gap-1.5 font-bold animate-pulse"
                onClick={handleAskName}
                disabled={askingName}
                title="Lead ainda sem nome — manda a pergunta agora pra liberar o resto do fluxo"
              >
                {askingName ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                Pedir nome do lead
              </Button>
            </div>
          )}
        </header>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-3 mt-2 grid grid-cols-2 h-10">
            <TabsTrigger value="passos" className="gap-1.5 text-xs">
              <ListChecks className="w-3.5 h-3.5" /> Passos
              <span className="ml-1 text-[10px] bg-primary/15 px-1.5 py-0.5 rounded-full font-bold">{sentSteps.size}</span>
            </TabsTrigger>
            <TabsTrigger value="ficha" className="gap-1.5 text-xs">
              <IdCard className="w-3.5 h-3.5" /> Ficha
              <span className="ml-1 text-[10px] bg-primary/15 px-1.5 py-0.5 rounded-full font-bold">{filledCount}/{totalFields}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="passos" className="flex-1 overflow-y-auto p-3 mt-2 mb-0 data-[state=inactive]:hidden">
            <CaptureStepsList
              consultantId={consultantId}
              customerId={customerId}
              sentSteps={sentSteps}
              onSent={async (key) => {
                setSentSteps((s) => new Set(s).add(key));
                // NÃO pausar o bot — Modo Captação é assistido: consultor envia o prompt,
                // mas o bot precisa continuar processando a resposta do lead (OCR da conta,
                // captura de CPF/CEP, avanço do passo). Use o botão "Assumir" para takeover real.
              }}
              defaultVariant={(customer as any)?.flow_variant || "A"}
              currentStep={(customer as any)?.conversation_step}
            />
          </TabsContent>

          <TabsContent value="ficha" className="flex-1 overflow-hidden p-0 mt-2 mb-0 data-[state=inactive]:hidden">
            <FichaWrap customerId={customerId} />
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <footer
          className={`border-t border-border/60 bg-card/80 backdrop-blur sticky bottom-0 z-20 ${expanded ? "p-3 space-y-2" : "px-3 pt-2 pb-2 space-y-1.5"}`}
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}
        >
          {customer?.conversation_step && ["finalizando", "portal_submitting", "aguardando_otp", "validando_otp"].includes(customer.conversation_step) && (
            <p className="text-[11px] text-center text-primary font-semibold animate-pulse">
              🚀 Portal: {customer.conversation_step.replace("_", " ")}…
            </p>
          )}
          <Button
            size="lg"
            className={`w-full font-bold gap-2 ${expanded ? "h-12 text-base" : "h-11 text-sm"} ${canSubmit ? "animate-pulse" : ""}`}
            onClick={handleSubmit}
            disabled={submitting || !customer?.name || !customer?.cpf}
            title={!customer?.name || !customer?.cpf ? "Precisa de nome e CPF no mínimo" : "Enviar pro portal e disparar OTP"}
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trophy className="w-5 h-5" />}
            {canSubmit ? "CADASTRAR TUDO" : `FINALIZAR (${filledCount}/${totalFields})`}
          </Button>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              {filledCount}/{totalFields} campos · {sentSteps.size}/10 passos
            </span>
            <Button variant="ghost" size="sm" className="text-[10px] text-muted-foreground h-6 px-2" onClick={disableCapture}>
              Sair do modo
            </Button>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}

/** Embedded ficha (no extra header/footer — Sheet provides them) */
function FichaWrap({ customerId }: { customerId: string }) {
  return (
    <div className="h-full w-full overflow-hidden">
      <CaptureLeadCard customerId={customerId} embedded />
    </div>
  );
}

