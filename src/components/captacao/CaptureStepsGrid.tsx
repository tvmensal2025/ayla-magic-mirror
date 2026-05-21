import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Check, MessageCircle, Mic, ImageIcon, Video, Edit3, Lock } from "lucide-react";
import { normalizeSendStepError } from "@/lib/whatsapp/send";

interface Props {
  consultantId: string;
  customerId: string;
  /** Variante A/B/C do lead — filtra o fluxo certo */
  variant?: "A" | "B" | "C";
  /** Map stepId -> "sent" | "responded" status */
  sentSteps: Set<string>;
  onSent: (stepId: string) => void;
  onEditTemplate?: (stepKey: string, text: string) => void;
  /** Quando true, dispara o próximo tile sozinho ao detectar resposta inbound do lead */
  autoMode?: boolean;
}

interface StepRow {
  id: string;
  title: string | null;
  step_key: string | null;
  position: number;
  message_text: string | null;
  step_type?: string | null;
  /** quando true, este é um tile sintético (não existe em bot_flow_steps) */
  __synthetic?: boolean;
}

const SYNTHETIC_EMAIL: StepRow = {
  id: "__synth_ask_email",
  title: "📧 E-mail",
  step_key: "ask_email",
  position: 98,
  message_text: null,
  step_type: "capture_email",
  __synthetic: true,
};
const SYNTHETIC_CONFIRM_PHONE: StepRow = {
  id: "__synth_confirm_phone",
  title: "📱 Confirmar WhatsApp",
  step_key: "ask_phone_confirm",
  position: 99,
  message_text: null,
  step_type: "confirm_phone",
  __synthetic: true,
};

export function CaptureStepsGrid({ consultantId, customerId, variant = "A", sentSteps, onSent, onEditTemplate, autoMode = false }: Props) {
  const { toast } = useToast();
  const [sending, setSending] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [autoCountdown, setAutoCountdown] = useState<{ stepId: string; secs: number } | null>(null);
  const autoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: flows } = await supabase
        .from("bot_flows").select("id, variant")
        .eq("consultant_id", consultantId).eq("is_active", true)
        .order("variant", { ascending: true });
      const list = (flows as any[]) || [];
      const flow = list.find((f) => String(f.variant) === variant) || list[0];
      if (!flow) { if (mounted) setSteps([]); return; }
      const { data } = await supabase
        .from("bot_flow_steps")
        .select("id, title, step_key, position, message_text, step_type")
        .eq("flow_id", flow.id)
        .eq("is_active", true)
        .order("position", { ascending: true })
        .limit(20);
      const rows = ((data as StepRow[]) || []);
      const hasEmail = rows.some((r) => r.step_type === "capture_email" || r.step_key === "ask_email");
      const hasConfirm = rows.some((r) => r.step_type === "confirm_phone" || r.step_key === "ask_phone_confirm");
      const merged = [...rows.slice(0, 10)];
      if (!hasEmail) merged.push(SYNTHETIC_EMAIL);
      if (!hasConfirm) merged.push(SYNTHETIC_CONFIRM_PHONE);
      if (mounted) setSteps(merged);
    })();
    return () => { mounted = false; };
  }, [consultantId, variant]);

  const display = steps;
  // Próximo tile não enviado (cabeça da fila) — único habilitado quando há trava
  const nextUnsentIdx = display.findIndex((s) => !sentSteps.has(s.id));

  const sendStep = async (step: StepRow, label: string, continueFlow = true) => {
    if (sending) return;
    setSending(step.id);
    try {
      const payload: any = { consultantId, customerId, part: "all", continueFlow, variant };
      if (step.__synthetic) payload.stepKey = step.step_key;
      else payload.stepId = step.id;
      const { data, error } = await supabase.functions.invoke("manual-step-send", {
        body: payload,
      });
      if (error || (data as any)?.error || (data as any)?.ok === false) {
        const parsed = normalizeSendStepError(error, data);
        throw new Error(parsed.message);
      }
      onSent(step.id);
      const next = (data as any)?.next_step;
      toast({ title: continueFlow ? `Seguindo fluxo ✓` : `Passo enviado ✓`, description: next ? `${label} → ${next}` : label });
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSending(null);
    }
  };

  const loadTemplate = async (stepId: string, stepKey: string | null) => {
    if (stepId.startsWith("__synth_")) { onEditTemplate?.(stepKey || "", ""); return; }
    const { data } = await supabase.from("bot_flow_steps").select("message_text").eq("id", stepId).maybeSingle();
    onEditTemplate?.(stepKey || stepId, (data as any)?.message_text || "");
  };

  // Auto-pilot: dispara o próximo tile quando o lead responder no WhatsApp (inbound)
  useEffect(() => {
    if (!autoMode || !customerId || display.length === 0) return;
    const ch = supabase
      .channel(`autofire-${customerId}-${Math.random().toString(36).slice(2, 7)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations", filter: `customer_id=eq.${customerId}` },
        (payload) => {
          const row: any = payload.new;
          if (String(row?.message_direction) !== "inbound") return;
          const next = display.find((s) => !sentSteps.has(s.id));
          if (!next) return;
          // countdown visual 3..2..1
          if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
          let secs = 3;
          setAutoCountdown({ stepId: next.id, secs });
          const tick = () => {
            secs -= 1;
            if (secs <= 0) {
              setAutoCountdown(null);
              void sendStep(next, next.title || next.step_key || `Passo ${next.position}`);
            } else {
              setAutoCountdown({ stepId: next.id, secs });
              autoTimerRef.current = window.setTimeout(tick, 1000) as unknown as number;
            }
          };
          autoTimerRef.current = window.setTimeout(tick, 1000) as unknown as number;
        }
      )
      .subscribe();
    return () => {
      if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
      setAutoCountdown(null);
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, customerId, display.length, sentSteps]);

  if (display.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
        Nenhum passo de fluxo configurado. Configure seu fluxo em <span className="font-semibold">/admin/fluxos</span> para usar como templates aqui.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold uppercase tracking-wide text-muted-foreground">Passos enviados (ordem travada)</span>
        <span className="tabular-nums font-bold text-primary">{sentSteps.size}/{display.length}</span>
      </div>
      <div className="h-1 rounded-full bg-secondary overflow-hidden">
        <div className="h-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all duration-500"
             style={{ width: `${Math.round((sentSteps.size / Math.max(display.length, 1)) * 100)}%` }} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 capture-card-flip">
        {display.map((s: any, i: number) => {
          const sent = sentSteps.has(s.id);
          const isSending = sending === s.id;
          const isNext = i === nextUnsentIdx;
          const locked = !sent && !isNext;
          const counting = autoCountdown?.stepId === s.id;
          return (
            <div
              key={s.id}
              className={`group relative rounded-lg border p-2.5 transition-all duration-300 ${
                sent
                  ? "border-primary/60 bg-gradient-to-br from-primary/15 to-emerald-500/5 shadow-[0_0_18px_hsl(var(--primary)/0.25)] animate-card-flip"
                  : locked
                    ? "border-border/40 bg-muted/20 opacity-50"
                    : counting
                      ? "border-emerald-500 bg-emerald-500/10 animate-pulse shadow-[0_0_20px_hsl(var(--primary)/0.5)]"
                      : isNext
                        ? "border-primary bg-card hover:border-primary/80 hover:shadow-lg hover:-translate-y-0.5 ring-1 ring-primary/30"
                        : "border-border bg-card"
              }`}
            >
              <div className="flex items-start justify-between mb-1.5">
                <span className={`text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded ${sent ? "bg-primary text-primary-foreground" : locked ? "bg-secondary/40 text-muted-foreground" : "bg-secondary text-primary"}`}>Passo {s.position}</span>
                {sent ? (
                  <Check className="w-3.5 h-3.5 text-primary drop-shadow-[0_0_4px_hsl(var(--primary))]" />
                ) : locked ? (
                  <Lock className="w-3 h-3 text-muted-foreground" />
                ) : counting ? (
                  <span className="text-[10px] font-black text-emerald-400 tabular-nums">{autoCountdown?.secs}s</span>
                ) : null}
              </div>
              <p className={`text-xs font-semibold leading-tight line-clamp-2 min-h-[2rem] ${locked ? "text-muted-foreground" : ""}`}>
                {s.title || s.step_key || "Passo"}
              </p>
              <div className="flex items-center gap-1 mt-1 text-muted-foreground">
                <MessageCircle className="w-3 h-3" />
                <Mic className="w-3 h-3" />
                <ImageIcon className="w-3 h-3" />
                <Video className="w-3 h-3" />
              </div>
              <div className="mt-2 flex items-center gap-1">
                <Button
                  size="sm"
                  variant={sent ? "outline" : "default"}
                  className="h-8 px-2 text-[11px] flex-1 min-h-[40px] md:min-h-[32px]"
                  onClick={() => sendStep(s as StepRow, s.title || s.step_key || `Passo ${s.position}`)}
                  disabled={!!sending || locked}
                  aria-busy={isSending}
                  title={locked ? "Conclua o passo anterior" : ""}
                >
                  {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : locked ? <Lock className="w-3 h-3" /> : <><Send className="w-3 h-3 mr-1" /> {sent ? "Reenviar" : "Enviar"}</>}
                </Button>
                {onEditTemplate && !locked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => void loadTemplate(s.id, s.step_key)}
                    title="Editar antes de enviar"
                  >
                    <Edit3 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
