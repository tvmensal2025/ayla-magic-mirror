import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Check, MessageCircle, Mic, ImageIcon, Video, Edit3 } from "lucide-react";
import { normalizeSendStepError } from "@/lib/whatsapp/send";

interface Props {
  consultantId: string;
  customerId: string;
  /** Map stepId -> "sent" | "responded" status */
  sentSteps: Set<string>;
  onSent: (stepId: string) => void;
  onEditTemplate?: (stepKey: string, text: string) => void;
}

interface StepRow { id: string; title: string | null; step_key: string | null; position: number; message_text: string | null; }

export function CaptureStepsGrid({ consultantId, customerId, sentSteps, onSent, onEditTemplate }: Props) {
  const { toast } = useToast();
  const [sending, setSending] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: flows } = await supabase
        .from("bot_flows").select("id")
        .eq("consultant_id", consultantId).eq("is_active", true).limit(1);
      if (!flows?.[0]) { if (mounted) setSteps([]); return; }
      const { data } = await supabase
        .from("bot_flow_steps")
        .select("id, title, step_key, position, message_text")
        .eq("flow_id", flows[0].id)
        .eq("is_active", true)
        .order("position", { ascending: true })
        .limit(10);
      if (mounted) setSteps((data as StepRow[]) || []);
    })();
    return () => { mounted = false; };
  }, [consultantId]);

  const display = steps;


  const sendStep = async (stepId: string, label: string, continueFlow = true) => {
    // B1 — defesa anti double-click: ignora segundo clique enquanto qualquer envio rola.
    if (sending) return;
    setSending(stepId);
    try {
      const { data, error } = await supabase.functions.invoke("manual-step-send", {
        body: { consultantId, customerId, stepId, part: "all", continueFlow },
      });
      if (error || (data as any)?.error || (data as any)?.ok === false) {
        const parsed = normalizeSendStepError(error, data);
        throw new Error(parsed.message);
      }
      onSent(stepId);
      const next = (data as any)?.next_step;
      toast({ title: continueFlow ? `Seguindo fluxo ✓` : `Passo enviado ✓`, description: next ? `${label} → ${next}` : label });
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSending(null);
    }
  };

  const loadTemplate = async (stepId: string, stepKey: string | null) => {
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
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold uppercase tracking-wide text-muted-foreground">Passos enviados</span>
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
          return (
            <div
              key={s.id}
              className={`group relative rounded-lg border p-2.5 transition-all duration-300 ${
                sent
                  ? "border-primary/60 bg-gradient-to-br from-primary/15 to-emerald-500/5 shadow-[0_0_18px_hsl(var(--primary)/0.25)] animate-card-flip"
                  : "border-border bg-card hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5"
              }`}
            >
              <div className="flex items-start justify-between mb-1.5">
                <span className={`text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded ${sent ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}>Passo {s.position}</span>
                {sent && <Check className="w-3.5 h-3.5 text-primary drop-shadow-[0_0_4px_hsl(var(--primary))]" />}
              </div>
              <p className="text-xs font-semibold leading-tight line-clamp-2 min-h-[2rem]">
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
                  className="h-7 px-2 text-[11px] flex-1"
                  onClick={() => sendStep(s.id, s.title || s.step_key || `Passo ${s.position}`)}
                  disabled={!!sending}
                  aria-busy={isSending}
                >
                  {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3 mr-1" /> Enviar</>}
                </Button>
                {onEditTemplate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
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
