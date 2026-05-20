import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CaptureStepsList } from "./CaptureStepsList";
import { CaptureLeadCard } from "./CaptureLeadCard";
import { CaptureProgressBar } from "./CaptureProgressBar";
import { useCaptureSession, CAPTURE_FIELDS } from "@/hooks/useCaptureSession";
import { useCaptureScoreboard } from "@/hooks/useCaptureScoreboard";
import { fireRandomCelebration, MOTIVATIONAL_PHRASES } from "@/lib/captureGame";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { X, Gamepad2, ListChecks, IdCard, Loader2, Trophy, ChevronDown, ChevronUp } from "lucide-react";

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
  const lastCountRef = useRef(0);

  useEffect(() => { setSentSteps(new Set()); setMinimized(false); }, [customerId]);
  useEffect(() => { if (!open) setMinimized(false); }, [open]);

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
        className="h-[100dvh] w-full p-0 flex flex-col gap-0 rounded-none border-0 bg-background sm:max-w-none"
      >
        {/* Header */}
        <header className="px-3 pt-3 pb-2 border-b border-border bg-gradient-to-br from-primary/10 via-card to-card sticky top-0 z-20">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
              <Gamepad2 className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{customerName || phoneNumber || "Lead"}</p>
              <p className="text-[10px] text-muted-foreground truncate">{phoneNumber}</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0"
              onClick={() => setMinimized(true)}
              title="Minimizar (liberar input do chat)"
            >
              <ChevronDown className="w-5 h-5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => onOpenChange(false)} title="Fechar">
              <X className="w-5 h-5" />
            </Button>
          </div>
          <CaptureProgressBar progress={progress} filled={filledCount} total={totalFields} />
          <p className="text-[11px] text-center mt-1.5 font-semibold text-primary/90">{phrase}</p>
          {nextMissing && !canSubmit && (
            <p className="text-[11px] text-center mt-0.5 text-muted-foreground">
              🎯 Próximo: <span className="font-bold text-foreground">{nextMissing.label}</span>
            </p>
          )}
          <p className="text-[10px] text-center mt-0.5 text-muted-foreground">
            Passo {sentSteps.size} de 10 enviado
          </p>
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
              onSent={(id) => setSentSteps((s) => new Set(s).add(id))}
              defaultVariant={(customer as any)?.flow_variant || "A"}
            />
          </TabsContent>

          <TabsContent value="ficha" className="flex-1 overflow-hidden p-0 mt-2 mb-0 data-[state=inactive]:hidden">
            <FichaWrap customerId={customerId} />
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <footer
          className="p-3 border-t border-border bg-card/80 backdrop-blur sticky bottom-0 z-20 space-y-2"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
        >
          {customer?.conversation_step && ["finalizando", "portal_submitting", "aguardando_otp", "validando_otp"].includes(customer.conversation_step) && (
            <p className="text-[11px] text-center text-primary font-semibold animate-pulse">
              🚀 Portal: {customer.conversation_step.replace("_", " ")}…
            </p>
          )}
          <Button
            size="lg"
            className={`w-full h-12 font-bold text-base gap-2 ${canSubmit ? "animate-pulse" : ""}`}
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
            <Button variant="ghost" size="sm" className="text-[10px] text-muted-foreground h-6" onClick={disableCapture}>
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

