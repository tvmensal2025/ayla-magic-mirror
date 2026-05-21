import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Send, X, Check, AlertCircle } from "lucide-react";
import { sendStepWithFeedback } from "@/lib/whatsapp/send";
import { toast } from "sonner";

export interface SequenceStep {
  step_key: string;
  step_id: string;
  title: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  consultantId: string;
  customerId: string;
  customerName?: string | null;
  steps: SequenceStep[]; // só passos pendentes
  onStepSent: (stepKey: string) => void;
  onAskName?: () => void;
}

type Status = "idle" | "running" | "done" | "cancelled" | "blocked";

export function SendSequenceDialog({
  open, onOpenChange, consultantId, customerId, customerName, steps, onStepSent, onAskName,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [idx, setIdx] = useState(0);
  const [errors, setErrors] = useState<Array<{ step: string; msg: string }>>([]);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (open) { setStatus("idle"); setIdx(0); setErrors([]); cancelRef.current = false; }
  }, [open]);

  const run = async () => {
    setStatus("running");
    cancelRef.current = false;
    for (let i = 0; i < steps.length; i++) {
      if (cancelRef.current) { setStatus("cancelled"); return; }
      setIdx(i);
      const s = steps[i];
      const res = await sendStepWithFeedback(
        { consultantId, customerId, stepId: s.step_id, part: "all", continueFlow: false },
        { silent: true },
      );
      if (res.ok) {
        onStepSent(s.step_key);
      } else {
        setErrors((prev) => [...prev, { step: s.title, msg: res.message || res.code || "erro" }]);
        if (res.code === "name_not_captured_yet") {
          setStatus("blocked");
          toast.error("Pare! Peça o nome do lead primeiro.");
          return;
        }
        if (res.code === "instance_disconnected" || res.code === "whapi_token_missing") {
          setStatus("blocked");
          toast.error(res.message || "Whatsapp do consultor com problema");
          return;
        }
        // outros erros: continua mas registra
      }
      if (i < steps.length - 1 && !cancelRef.current) {
        const delay = 2500 + Math.floor(Math.random() * 2000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    setStatus("done");
    toast.success(`Sequência concluída: ${steps.length - errors.length}/${steps.length} enviados`);
  };

  const cancel = () => { cancelRef.current = true; };

  const pct = steps.length === 0 ? 0 : Math.round(((idx + (status === "done" ? 1 : 0)) / steps.length) * 100);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && status === "running") return; onOpenChange(o); }}>
      <DialogContent className="max-w-sm p-0">
        <DialogHeader className="p-3 pb-2 border-b border-border">
          <DialogTitle className="text-sm">
            Enviar {steps.length} passos pendentes
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground truncate">
            Para: <span className="font-semibold">{customerName || "Lead"}</span> · delays humanos (2-5s)
          </p>
        </DialogHeader>

        <div className="p-3 space-y-3">
          {status === "idle" && (
            <p className="text-xs text-muted-foreground">
              Vou disparar cada passo em ordem, com pausa entre eles pra parecer humano.
              Você pode cancelar a qualquer momento.
            </p>
          )}

          {(status === "running" || status === "done" || status === "cancelled" || status === "blocked") && (
            <>
              <Progress value={pct} className="h-2" />
              <p className="text-[11px] text-center text-muted-foreground">
                {status === "running" ? `Enviando ${idx + 1} de ${steps.length}…` :
                 status === "done" ? "Concluído!" :
                 status === "cancelled" ? "Cancelado" :
                 "Bloqueado"}
              </p>
              {status === "running" && steps[idx] && (
                <p className="text-xs text-center font-semibold truncate">{steps[idx].title}</p>
              )}
            </>
          )}

          {errors.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 max-h-24 overflow-y-auto">
              <div className="flex items-center gap-1 text-[10px] font-bold text-destructive mb-1">
                <AlertCircle className="w-3 h-3" /> {errors.length} falha{errors.length > 1 ? "s" : ""}
              </div>
              {errors.map((e, i) => (
                <p key={i} className="text-[10px] text-muted-foreground truncate">
                  • {e.step}: {e.msg}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border flex gap-2">
          {status === "idle" && (
            <>
              <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button size="sm" className="flex-1 h-9 gap-1.5 font-bold" onClick={run} disabled={steps.length === 0}>
                <Send className="w-3.5 h-3.5" /> Disparar tudo
              </Button>
            </>
          )}
          {status === "running" && (
            <Button variant="destructive" size="sm" className="w-full h-9 gap-1.5" onClick={cancel}>
              <X className="w-3.5 h-3.5" /> Cancelar
            </Button>
          )}
          {status === "blocked" && errors.some((e) => /nome/i.test(e.msg)) && onAskName && (
            <Button size="sm" className="flex-1 h-9 gap-1.5" onClick={() => { onAskName(); onOpenChange(false); }}>
              Pedir nome do lead
            </Button>
          )}
          {(status === "done" || status === "cancelled" || status === "blocked") && (
            <Button size="sm" variant="outline" className="flex-1 h-9 gap-1.5" onClick={() => onOpenChange(false)}>
              {status === "done" ? <Check className="w-3.5 h-3.5" /> : null} Fechar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
