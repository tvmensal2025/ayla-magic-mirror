import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Check, MessageCircle, Mic, ImageIcon, Video, Edit3, Lock, Eye } from "lucide-react";
import { normalizeSendStepError } from "@/lib/whatsapp/send";
import { CaptureStepPreview } from "./CaptureStepPreview";

interface Props {
  consultantId: string;
  customerId: string;
  /** Variante A/B/C do lead — filtra o fluxo certo */
  variant?: "A" | "B" | "C";
  /** Map stepId -> "sent" | "responded" status */
  sentSteps: Set<string>;
  onSent: (stepId: string) => void;
  onEditTemplate?: (stepKey: string, text: string) => void;
}

interface StepRow {
  id: string;
  title: string | null;
  step_key: string | null;
  position: number;
  message_text: string | null;
  step_type?: string | null;
  media_order?: unknown;
  has_audio?: boolean;
  has_image?: boolean;
  has_video?: boolean;
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

export function CaptureStepsGrid({ consultantId, customerId, variant = "A", sentSteps, onSent, onEditTemplate }: Props) {
  const { toast } = useToast();
  const [sending, setSending] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [previewStep, setPreviewStep] = useState<StepRow | null>(null);
  const [customerFirstName, setCustomerFirstName] = useState<string>("amigo");
  const [billStr, setBillStr] = useState<string>("___");

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
        .select("id, title, step_key, position, message_text, step_type, media_order")
        .eq("flow_id", flow.id)
        .eq("is_active", true)
        .order("position", { ascending: true })
        .limit(20);
      const rows = ((data as StepRow[]) || []);

      // Check media library for each step's slot_key to light up icons
      const slotKeys = rows.map((r) => r.step_key).filter(Boolean) as string[];
      let mediaMap: Record<string, { audio: boolean; image: boolean; video: boolean }> = {};
      if (slotKeys.length) {
        const { data: medias } = await supabase
          .from("ai_media_library")
          .select("kind, slot_key")
          .eq("consultant_id", consultantId)
          .in("slot_key", slotKeys)
          .eq("active", true)
          .eq("is_draft", false);
        for (const m of (medias as any[]) || []) {
          const k = m.slot_key as string;
          if (!mediaMap[k]) mediaMap[k] = { audio: false, image: false, video: false };
          const kind = String(m.kind).toLowerCase();
          if (kind === "audio") mediaMap[k].audio = true;
          if (kind === "image") mediaMap[k].image = true;
          if (kind === "video") mediaMap[k].video = true;
        }
      }
      const enriched = rows.map((r) => ({
        ...r,
        has_audio: !!(r.step_key && mediaMap[r.step_key]?.audio && variant !== "B"),
        has_image: !!(r.step_key && mediaMap[r.step_key]?.image),
        has_video: !!(r.step_key && mediaMap[r.step_key]?.video),
      }));

      const hasEmail = enriched.some((r) => r.step_type === "capture_email" || r.step_key === "ask_email");
      const hasConfirm = enriched.some((r) => r.step_type === "confirm_phone" || r.step_key === "ask_phone_confirm");
      const merged = [...enriched.slice(0, 10)];
      if (!hasEmail) merged.push(SYNTHETIC_EMAIL);
      if (!hasConfirm) merged.push(SYNTHETIC_CONFIRM_PHONE);
      if (mounted) setSteps(merged);
    })();
    return () => { mounted = false; };
  }, [consultantId, variant]);

  // Load customer name + bill for variable rendering in inline preview
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("customers")
        .select("name, electricity_bill_value")
        .eq("id", customerId)
        .maybeSingle();
      if (!mounted) return;
      const first = String((data as any)?.name || "").trim().split(/\s+/)[0] || "amigo";
      setCustomerFirstName(first);
      const bill = Number((data as any)?.electricity_bill_value || 0);
      setBillStr(bill > 0
        ? bill.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "___");
    })();
    return () => { mounted = false; };
  }, [customerId]);

  const renderVars = useMemo(() => {
    return (s: string | null) => {
      if (!s) return "";
      const vars: Record<string, string> = {
        "{{nome}}": customerFirstName, "{nome}": customerFirstName,
        "{{valor}}": billStr, "{valor}": billStr,
        "{{valor_conta}}": billStr, "{valor_conta}": billStr,
        "{{conta}}": billStr, "{conta}": billStr,
      };
      return Object.entries(vars).reduce((acc, [k, v]) => acc.split(k).join(v), s);
    };
  }, [customerFirstName, billStr]);

  const display = steps;
  const nextUnsentIdx = display.findIndex((s) => !sentSteps.has(s.id));

  const doSend = async (step: StepRow, label: string, opts?: { continueFlow?: boolean }) => {
    if (sending) return;
    setSending(step.id);
    try {
      const payload: any = {
        consultantId,
        customerId,
        part: "all",
        continueFlow: opts?.continueFlow ?? false,
        variant,
      };
      if (step.__synthetic) payload.stepKey = step.step_key;
      else payload.stepId = step.id;
      const { data, error } = await supabase.functions.invoke("manual-step-send", { body: payload });
      if (error || (data as any)?.error || (data as any)?.ok === false) {
        const parsed = normalizeSendStepError(error, data);
        throw new Error(parsed.message);
      }
      onSent(step.id);
      setPreviewStep(null);
      toast({ title: "Passo enviado ✓", description: label });
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

  if (display.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
        Nenhum passo de fluxo configurado. Configure seu fluxo em <span className="font-semibold">/admin/fluxos</span> para usar como templates aqui.
      </div>
    );
  }

  return (
    <>
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
          {display.map((s: StepRow, i: number) => {
            const sent = sentSteps.has(s.id);
            const isSending = sending === s.id;
            const isNext = i === nextUnsentIdx;
            const locked = !sent && !isNext;
            const inlinePreview = renderVars(s.message_text).trim();
            return (
              <div
                key={s.id}
                className={`group relative rounded-lg border p-2.5 transition-all duration-300 ${
                  sent
                    ? "border-primary/60 bg-gradient-to-br from-primary/15 to-emerald-500/5 shadow-[0_0_18px_hsl(var(--primary)/0.25)] animate-card-flip"
                    : locked
                      ? "border-border/40 bg-muted/20 opacity-50"
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
                  ) : null}
                </div>
                <p className={`text-xs font-semibold leading-tight line-clamp-2 min-h-[2rem] ${locked ? "text-muted-foreground" : ""}`}>
                  {s.title || s.step_key || "Passo"}
                </p>
                {!locked && inlinePreview && (
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground line-clamp-2 italic">
                    “{inlinePreview}”
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <MessageCircle className="w-3 h-3 text-emerald-400/80" />
                  <Mic className={`w-3 h-3 ${s.has_audio ? "text-emerald-400" : "text-muted-foreground/30"}`} />
                  <ImageIcon className={`w-3 h-3 ${s.has_image ? "text-amber-400" : "text-muted-foreground/30"}`} />
                  <Video className={`w-3 h-3 ${s.has_video ? "text-cyan-400" : "text-muted-foreground/30"}`} />
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={sent ? "outline" : "default"}
                    className="h-8 px-2 text-[11px] flex-1 min-h-[40px] md:min-h-[32px]"
                    onClick={() => setPreviewStep(s)}
                    disabled={!!sending || locked}
                    aria-busy={isSending}
                    title={locked ? "Conclua o passo anterior" : "Ver e enviar"}
                  >
                    {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : locked ? <Lock className="w-3 h-3" /> : <><Eye className="w-3 h-3 mr-1" /> {sent ? "Reenviar" : "Ver e enviar"}</>}
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

      {previewStep && (
        <CaptureStepPreview
          open={!!previewStep}
          onOpenChange={(o) => { if (!o) setPreviewStep(null); }}
          consultantId={consultantId}
          customerId={customerId}
          step={{
            id: previewStep.id,
            title: previewStep.title,
            step_key: previewStep.step_key,
            message_text: previewStep.message_text,
            media_order: previewStep.media_order ?? null,
            variant,
          }}
          onSend={(opts) =>
            doSend(previewStep, previewStep.title || previewStep.step_key || `Passo ${previewStep.position}`, opts)
          }
          sending={sending === previewStep.id}
        />
      )}
    </>
  );
}
