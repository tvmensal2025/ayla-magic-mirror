import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Trophy, Loader2, AlertCircle } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { normalizeSendStepError } from "@/lib/whatsapp/send";

interface Props {
  consultantId: string;
  customerId: string;
  variant?: "A" | "B" | "C";
  missing: string[];
  isComplete: boolean;
  allStepsSent: boolean;
  pendingStepsCount: number;
}

export function FinalizeButton({ consultantId, customerId, variant = "A", missing, isComplete, allStepsSent, pendingStepsCount }: Props) {
  const [sending, setSending] = useState(false);
  const canFinalize = isComplete && allStepsSent;

  const blockers: string[] = [...missing];
  if (!allStepsSent) blockers.push(`${pendingStepsCount} passo(s) do fluxo`);

  const handleFinalize = async () => {
    if (!canFinalize || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("manual-step-send", {
        body: { consultantId, customerId, part: "all", continueFlow: true, variant, stepKey: "finalizar_cadastro" },
      });
      if (error || (data as any)?.error || (data as any)?.ok === false) {
        const parsed = normalizeSendStepError(error, data);
        throw new Error(parsed.message);
      }
      sonnerToast.success("🏆 Cadastro finalizado! Enviando para o portal…");
    } catch (e: any) {
      sonnerToast.error(e?.message || "Falha ao finalizar");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="sticky bottom-0 left-0 right-0 border-t border-border/60 bg-card/80 backdrop-blur-md px-3 py-2.5 z-10" style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom, 0px))" }}>
      {!canFinalize && blockers.length > 0 && (
        <div className="flex items-start gap-1.5 text-[10px] text-amber-400 mb-1.5">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          <p className="leading-tight">
            <span className="font-bold">Falta: </span>{blockers.slice(0, 4).join(", ")}{blockers.length > 4 ? ` +${blockers.length - 4}` : ""}
          </p>
        </div>
      )}
      <Button
        onClick={handleFinalize}
        disabled={!canFinalize || sending}
        className={`w-full h-11 font-black uppercase tracking-wide ${canFinalize ? "bg-gradient-to-r from-emerald-500 to-lime-500 hover:from-emerald-400 hover:to-lime-400 text-black animate-pulse shadow-[0_0_24px_hsl(var(--primary)/0.5)]" : ""}`}
        variant={canFinalize ? "default" : "secondary"}
      >
        {sending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Trophy className="w-4 h-4 mr-2" />
            {canFinalize ? "Finalizar Cadastro 🚀" : `Faltam ${blockers.length} item(s)`}
          </>
        )}
      </Button>
    </div>
  );
}
