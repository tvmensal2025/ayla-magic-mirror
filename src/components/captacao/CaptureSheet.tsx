import { useState, useEffect, useRef, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CaptureStepsList } from "./CaptureStepsList";
import { CaptureLeadCard } from "./CaptureLeadCard";
import { CaptureProgressBar } from "./CaptureProgressBar";
import { SendSequenceDialog, type SequenceStep } from "./SendSequenceDialog";
import { useCaptureSession, CAPTURE_FIELDS } from "@/hooks/useCaptureSession";
import { useCaptureScoreboard } from "@/hooks/useCaptureScoreboard";
import { useCaptureCombo } from "@/hooks/useCaptureCombo";
import { fireRandomCelebration, MOTIVATIONAL_PHRASES } from "@/lib/captureGame";
import { haptics } from "@/lib/haptics";
import { sfx } from "@/components/captacao/game/sfx";
import { useGameMode } from "@/components/captacao/game/useGameMode";
import { ComboTimer } from "@/components/captacao/game/ComboTimer";
import { XpFloaterProvider, useXpFloater } from "@/components/captacao/game/XpFloater";
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

export function CaptureSheet(props: Props) {
  // Wrap everything in the XP floater provider so child components can
  // call `useXpFloater().show(amount)` whenever a field is captured or a
  // combo bonus fires. Mounting it here (instead of at App root) keeps
  // the floater scoped to the captação modal — when the sheet closes,
  // pending floats are cleaned up too.
  return (
    <XpFloaterProvider>
      <CaptureSheetInner {...props} />
    </XpFloaterProvider>
  );
}

function CaptureSheetInner({ open, onOpenChange, consultantId, customerId, customerName, phoneNumber }: Props) {
  const { customer, filledCount, totalFields, progress } = useCaptureSession(customerId);
  const { bump } = useCaptureScoreboard(consultantId);
  const combo = useCaptureCombo();
  const xpFloater = useXpFloater();
  const { sound } = useGameMode(consultantId);
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
  const pendingSteps = useMemo(() => allSteps.filter((s) => !sentSteps.has(s.step_key)), [allSteps, sentSteps]);
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

      // 🎮 Game feedback layer — dispara em cada CAPTURA de campo:
      //   1. Haptic feedback (mobile) — vibração curta de 40ms
      //   2. SFX ding (se som ligado pelo consultor)
      //   3. XP floater: número subindo da barra ("+10 XP")
      //   4. Combo: se já passou do 1º campo, soma multiplicador (visual)
      //
      // Em milestones (5, 8, 10) eleva o feedback: success haptic + coin SFX.
      const isMilestone = filledCount === 5 || filledCount === 8 || filledCount === totalFields;
      if (isMilestone) {
        haptics.success();
        sfx.coin(sound);
      } else {
        haptics.tap();
        sfx.ding(sound);
      }

      // XP floater visível para o consultor — incentiva o "vício" do XP
      // que vai crescendo a cada toque.
      const xpGain = isMilestone ? 25 : 10;
      xpFloater.show(xpGain);
    }
    lastCountRef.current = filledCount;
  }, [filledCount, customer, toast, totalFields, sound, xpFloater]);

  const billHasData = !!(customer as any)?.numero_instalacao || !!(customer as any)?.address_street || !!(customer as any)?.bill_holder_name;
  const docHasData = !!(customer as any)?.cpf || !!(customer as any)?.rg;
  const billConfirmed = !billHasData || !!(customer as any)?.bill_data_confirmed_at;
  const docConfirmed = !docHasData || !!(customer as any)?.doc_data_confirmed_at;
  const allConfirmed = billConfirmed && docConfirmed;
  const canSubmit = filledCount === totalFields && allConfirmed;
  const phrase = MOTIVATIONAL_PHRASES[filledCount] || `Faltam ${totalFields - filledCount} dados 💪`;
  const nextMissing = CAPTURE_FIELDS.find((f) => {
    const v = (customer as any)?.[f.key];
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && !v.trim()) return true;
    if (f.key === "electricity_bill_value" && Number(v) <= 0) return true;
    return false;
  });

  // Lista descritiva do que falta (texto mostrado no tooltip do botão final).
  // Antes só dizia "N campos", o que confundia o consultor — agora aponta os
  // labels exatos pra ele localizar na ficha.
  const missingFieldLabels = CAPTURE_FIELDS.filter((f) => {
    const v = (customer as any)?.[f.key];
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && !v.trim()) return true;
    if (f.key === "electricity_bill_value" && Number(v) <= 0) return true;
    return false;
  }).map((f) => f.label);
  const submitTooltip = canSubmit
    ? "Enviar pro portal (VPS + OTP)"
    : [
        missingFieldLabels.length > 0 ? `Faltam: ${missingFieldLabels.join(", ")}` : "",
        !billConfirmed ? "Confirmar dados da conta de luz" : "",
        !docConfirmed ? "Confirmar dados do documento" : "",
      ].filter(Boolean).join(" · ");

  const handleSubmit = async () => {
    if (!customer || !canSubmit) return;
    setSubmitting(true);
    try {
      // Mantém capture_mode='manual' — captação fica sempre ligada por padrão para todos os leads.
      await supabase.from("customers").update({
        conversation_step: "finalizando",
      }).eq("id", customer.id);

      // 🏆 Cadastro completo — 5 efeitos combinados:
      //   1. Confetti aleatório (já existia)
      //   2. Bump scoreboard
      //   3. Triple-vibration (victory haptic) no celular
      //   4. SFX level-up
      //   5. Combo bumped — premia o próximo cadastro
      //   6. XP floater grande (+100 XP CADASTRO!)
      fireRandomCelebration();
      haptics.victory();
      sfx.levelUp(sound);
      const c = combo.onCapture();
      xpFloater.show(100 + c.bonusXp, c.level >= 2 ? `COMBO x${c.level}` : undefined);
      await bump();

      toast({ title: "🎉 Cadastro enviado!", description: "Portal Worker concluindo…", duration: 3500 });
      onOpenChange(false);
    } catch (e: any) {
      haptics.error();
      toast({ title: "Erro", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const disableCapture = async () => {
    // Apenas fecha o painel — modo Captação fica ligado para todos os leads.
    toast({ title: "Painel fechado", description: "A captação continua ativa em segundo plano." });
    onOpenChange(false);
  };

  const [askingName, setAskingName] = useState(false);
  // Alinhado com manual-step-send: nome do perfil do WhatsApp NÃO conta como capturado.
  const _nSrc = String((customer as any)?.name_source || ((customer as any)?.name ? "whatsapp_profile" : "")).toLowerCase();
  const needsName = ["", "unknown", "whatsapp_profile"].includes(_nSrc);
  const handleAskName = async () => {
    if (!customer) return;
    setAskingName(true);
    try {
      await askLeadName({ consultantId, customerId: customer.id, phoneHint: phoneNumber || undefined });
    } finally {
      setAskingName(false);
    }
  };

  // ⌨️ Atalhos de teclado (desktop only — mobile virtual keyboard ignora):
  //   Esc        → minimiza painel
  //   1..9, 0    → seleciona campo correspondente da ficha (vai pra tab "ficha")
  //   E          → vai pra tab "passos"
  //   C          → cadastrar (se canSubmit)
  //   M          → maximiza/minimiza
  //
  // Sem isso, no PC a navegação é 100% mouse — perde-se velocidade contra
  // o ritmo do bot/atendimento.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Não bloqueia se usuário está digitando em input/textarea/contenteditable.
      const target = e.target as HTMLElement | null;
      const isTyping = target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      );
      if (isTyping) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setMinimized(true);
        return;
      }
      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        setExpanded((v) => !v);
        return;
      }
      if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        setTab("passos");
        return;
      }
      if (e.key.toLowerCase() === "c" && canSubmit && !submitting) {
        e.preventDefault();
        void handleSubmit();
        return;
      }
      // 1..9 / 0 → ficha + scrollar pro campo correspondente
      if (/^[0-9]$/.test(e.key)) {
        const idx = e.key === "0" ? 9 : parseInt(e.key, 10) - 1;
        const field = CAPTURE_FIELDS[idx];
        if (field) {
          e.preventDefault();
          setTab("ficha");
          setTimeout(() => {
            const el = document.querySelector(`[data-capture-field="${field.key}"]`) as HTMLElement | null;
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              const focusable = el.querySelector<HTMLElement>("input, textarea, button");
              focusable?.focus();
            }
          }, 100);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, canSubmit, submitting]); // eslint-disable-line react-hooks/exhaustive-deps

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
        {/* Combo visível na pílula minimizada — consultor não perde o timer
            mesmo quando fecha o painel pra ler o chat. */}
        {combo.isActive && (
          <ComboTimer
            level={combo.level}
            secondsLeft={combo.secondsLeft}
            progressPct={combo.progressPct}
            bonusXp={combo.bonusXp}
            compact
          />
        )}
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
            : "h-[44dvh] min-h-[260px] max-h-[100dvh] rounded-t-2xl"
        }`}
      >
        {/* Grabber */}
        {!expanded && (
          <div className="flex justify-center pt-0.5 pb-0 shrink-0">
            <div className="w-8 h-0.5 rounded-full bg-muted-foreground/40" />
          </div>
        )}

        {/* Header — 1 linha só no compacto */}
        <header className={`px-2 border-b border-border/60 bg-gradient-to-br from-primary/10 via-card to-card sticky top-0 z-20 ${expanded ? "pt-3 pb-2" : "py-1"}`}>
          <div className={`flex items-center gap-1 ${expanded ? "mb-2" : ""}`}>
            <div className={`rounded-full bg-primary/15 flex items-center justify-center shrink-0 ${expanded ? "w-9 h-9" : "w-5 h-5"}`}>
              <Gamepad2 className={`text-primary ${expanded ? "w-4 h-4" : "w-2.5 h-2.5"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-bold truncate ${expanded ? "text-sm" : "text-[10px] leading-tight"}`}>
                {customerName || phoneNumber || "Lead"}
                {!expanded && phoneNumber && customerName && (
                  <span className="ml-1 text-[9px] text-muted-foreground font-normal">· {phoneNumber}</span>
                )}
              </p>
              {expanded && <p className="text-[10px] text-muted-foreground truncate">{phoneNumber}</p>}
            </div>
            {needsName && (
              <Button
                size="sm"
                variant="default"
                className={`gap-0.5 font-bold animate-pulse shrink-0 ${expanded ? "h-7 px-2 text-[10px]" : "h-5 px-1.5 text-[9px]"}`}
                onClick={handleAskName}
                disabled={askingName}
                title="Lead sem nome — peça agora pra liberar o resto"
              >
                {askingName ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <UserPlus className="w-2.5 h-2.5" />}
                Nome
              </Button>
            )}
            <div className="flex items-center gap-0 shrink-0">
              <Button size="icon" variant="ghost" className={expanded ? "h-6 w-6" : "h-5 w-5"} onClick={() => setExpanded((v) => !v)} title={expanded ? "Recolher" : "Expandir"}>
                {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-2.5 h-2.5" />}
              </Button>
              <Button size="icon" variant="ghost" className={expanded ? "h-6 w-6" : "h-5 w-5"} onClick={() => setMinimized(true)} title="Minimizar">
                <ChevronDown className={expanded ? "w-3 h-3" : "w-2.5 h-2.5"} />
              </Button>
              <Button size="icon" variant="ghost" className={expanded ? "h-6 w-6" : "h-5 w-5"} onClick={() => onOpenChange(false)} title="Fechar">
                <X className={expanded ? "w-3 h-3" : "w-2.5 h-2.5"} />
              </Button>
            </div>
          </div>
          {expanded && (
            <>
              <CaptureProgressBar progress={progress} filled={filledCount} total={totalFields} />
              <p className="text-[11px] text-center font-semibold text-primary/90 mt-1.5">{phrase}</p>
              {nextMissing && !canSubmit && (
                <p className="text-[11px] text-center mt-0.5 text-muted-foreground">
                  🎯 Próximo: <span className="font-bold text-foreground">{nextMissing.label}</span>
                </p>
              )}
              <p className="text-[10px] text-center mt-0.5 text-muted-foreground">
                Passo {sentSteps.size} de 10 enviado
              </p>
              {/* 🔥 Combo timer — só aparece quando combo ativo. Mostra
                  multiplicador, countdown e bonus XP do próximo cadastro. */}
              {combo.isActive && (
                <div className="mt-2">
                  <ComboTimer
                    level={combo.level}
                    secondsLeft={combo.secondsLeft}
                    progressPct={combo.progressPct}
                    bonusXp={combo.bonusXp}
                  />
                </div>
              )}
            </>
          )}
        </header>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className={`mx-2 grid grid-cols-2 ${expanded ? "mt-2 h-9" : "mt-0.5 h-6"}`}>
            <TabsTrigger value="passos" className={`gap-0.5 ${expanded ? "text-[11px]" : "text-[10px]"}`}>
              <ListChecks className={expanded ? "w-3 h-3" : "w-2.5 h-2.5"} /> Passos
              <span className={`ml-0.5 bg-primary/15 px-1 py-px rounded-full font-bold ${expanded ? "text-[9px]" : "text-[8px]"}`}>{sentSteps.size}</span>
            </TabsTrigger>
            <TabsTrigger value="ficha" className={`gap-0.5 ${expanded ? "text-[11px]" : "text-[10px]"}`}>
              <IdCard className={expanded ? "w-3 h-3" : "w-2.5 h-2.5"} /> Ficha
              <span className={`ml-0.5 bg-primary/15 px-1 py-px rounded-full font-bold ${expanded ? "text-[9px]" : "text-[8px]"}`}>{filledCount}/{totalFields}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="passos" className={`flex-1 overflow-y-auto ${expanded ? "p-3 mt-2" : "px-1.5 py-1 mt-0.5"} mb-0 data-[state=inactive]:hidden`}>
            <CaptureStepsList
              consultantId={consultantId}
              customerId={customerId}
              sentSteps={sentSteps}
              onSent={async (key) => {
                setSentSteps((s) => new Set(s).add(key));
              }}
              defaultVariant={(customer as any)?.flow_variant || "A"}
              currentStep={(customer as any)?.conversation_step}
              onStepsLoaded={setAllSteps}
            />
          </TabsContent>

          <TabsContent value="ficha" className="flex-1 overflow-hidden p-0 mt-1 mb-0 data-[state=inactive]:hidden">
            <FichaWrap customerId={customerId} />
          </TabsContent>
        </Tabs>

        {/* Footer — 1 linha só no compacto */}
        <footer
          className={`border-t border-border/60 bg-card/80 backdrop-blur sticky bottom-0 z-20 ${expanded ? "p-3 space-y-2" : "px-2 py-1"}`}
          style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom, 0px))" }}
        >
          {customer?.conversation_step && ["finalizando", "portal_submitting", "aguardando_otp", "validando_otp"].includes(customer.conversation_step) && (
            <p className="text-[10px] text-center text-primary font-semibold animate-pulse">
              🚀 Portal: {customer.conversation_step.replace("_", " ")}…
            </p>
          )}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className={`shrink-0 gap-1 font-bold ${expanded ? "h-12 px-3 text-xs" : "h-7 px-1.5 text-[9px]"}`}
              onClick={() => setSeqOpen(true)}
              disabled={pendingSteps.length === 0 || needsName}
              title={needsName ? "Peça o nome do lead primeiro" : pendingSteps.length === 0 ? "Tudo enviado" : `Disparar ${pendingSteps.length} passos pendentes`}
            >
              <Zap className={`${expanded ? "w-4 h-4" : "w-2.5 h-2.5"}`} /> Enviar tudo ({pendingSteps.length})
            </Button>
            <Button
              size="lg"
              className={`flex-1 font-bold gap-1 ${expanded ? "h-12 text-base" : "h-7 text-[10px]"} ${
                canSubmit
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:opacity-95 animate-game-cta-shake shadow-lg shadow-emerald-500/40"
                  : "bg-muted text-muted-foreground opacity-60 cursor-not-allowed hover:bg-muted"
              }`}
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
              title={submitTooltip}
            >
              {submitting ? <Loader2 className={`${expanded ? "w-5 h-5" : "w-3 h-3"} animate-spin`} /> : <Trophy className={`${expanded ? "w-5 h-5" : "w-3 h-3"}`} />}
              {canSubmit ? "CADASTRAR" : `${filledCount}/${totalFields}${!billConfirmed ? " ·📄" : ""}${!docConfirmed ? " ·🪪" : ""}`}
            </Button>
            <Button variant="ghost" size="sm" className={`shrink-0 text-muted-foreground ${expanded ? "h-12 text-xs px-2" : "h-7 px-1.5 text-[9px]"}`} onClick={disableCapture} title="Sair do modo captação">
              Sair
            </Button>
          </div>
        </footer>
      </SheetContent>

      <SendSequenceDialog
        open={seqOpen}
        onOpenChange={setSeqOpen}
        consultantId={consultantId}
        customerId={customerId}
        customerName={customerName || phoneNumber}
        steps={pendingSteps}
        variant={(((customer as any)?.flow_variant || "A").toUpperCase()) as "A" | "B" | "C"}
        onStepSent={(key) => setSentSteps((s) => new Set(s).add(key))}
        onAskName={handleAskName}
      />
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

