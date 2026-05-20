import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFlowSteps } from "@/hooks/useFlowSteps";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Check, MessageCircle, Mic, ImageIcon, Video, Edit3 } from "lucide-react";

interface Props {
  consultantId: string;
  customerId: string;
  /** Map stepId -> "sent" | "responded" status */
  sentSteps: Set<string>;
  onSent: (stepId: string) => void;
  onEditTemplate?: (stepKey: string, text: string) => void;
}

export function CaptureStepsGrid({ consultantId, customerId, sentSteps, onSent, onEditTemplate }: Props) {
  const { steps } = useFlowSteps(consultantId);
  const { toast } = useToast();
  const [sending, setSending] = useState<string | null>(null);

  // Pegamos os 10 primeiros passos do fluxo ativo
  const display = (steps || []).slice(0, 10);

  const sendStep = async (stepId: string, label: string) => {
    setSending(stepId);
    try {
      const { data, error } = await supabase.functions.invoke("manual-step-send", {
        body: { consultantId, customerId, stepId, part: "all", continueFlow: false },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      onSent(stepId);
      toast({ title: `Passo enviado ✓`, description: label });
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
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {display.map((s: any, i: number) => {
        const sent = sentSteps.has(s.id);
        const isSending = sending === s.id;
        return (
          <div
            key={s.id}
            className={`group relative rounded-lg border p-2.5 transition-all ${
              sent ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:border-primary/40 hover:shadow-md"
            }`}
          >
            <div className="flex items-start justify-between mb-1.5">
              <span className="text-[10px] font-bold text-primary tabular-nums">#{i + 1}</span>
              {sent && <Check className="w-3.5 h-3.5 text-primary" />}
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
                onClick={() => sendStep(s.id, s.title || s.step_key || `Passo ${i + 1}`)}
                disabled={isSending}
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
  );
}
