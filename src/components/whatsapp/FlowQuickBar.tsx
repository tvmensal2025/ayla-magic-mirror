import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Zap, Send, ListChecks, FastForward, Loader2, StopCircle, ExternalLink } from "lucide-react";
import { ManualStepDialog } from "@/components/admin/AIAgentTab/ManualStepDialog";

type Step = { id: string; step_key: string | null; title: string | null; position: number };

interface Props {
  consultantId?: string;
  customerId?: string;
  customerName?: string;
  disabled?: boolean;
}

export function FlowQuickBar({ consultantId, customerId, customerName, disabled }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [seq, setSeq] = useState<{ current: number; total: number } | null>(null);
  const abortRef = useRef(false);
  const [confirmFrom, setConfirmFrom] = useState<number | null>(null);
  const [oneByOneStepId, setOneByOneStepId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !consultantId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data: flow } = await supabase
        .from("bot_flows").select("id")
        .eq("consultant_id", consultantId).eq("is_active", true)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!flow?.id) { if (mounted) { setSteps([]); setLoading(false); } return; }
      const { data } = await supabase
        .from("bot_flow_steps")
        .select("id, step_key, title, position")
        .eq("flow_id", flow.id).eq("is_active", true)
        .order("position", { ascending: true });
      if (mounted) { setSteps((data as Step[]) || []); setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [open, consultantId]);

  async function invokeStep(stepId: string): Promise<boolean> {
    if (!consultantId || !customerId) return false;
    const { data, error } = await supabase.functions.invoke("manual-step-send", {
      body: { consultantId, customerId, stepId, part: "all" },
    });
    if (error || (data as any)?.error) {
      const msg = error?.message || (data as any)?.error || "Falha";
      toast({ title: "Erro ao enviar passo", description: msg, variant: "destructive" });
      return false;
    }
    return true;
  }

  async function sendFull(step: Step) {
    setSendingId(step.id);
    const ok = await invokeStep(step.id);
    setSendingId(null);
    if (ok) toast({ title: `✅ Passo enviado`, description: step.title || step.step_key || `Passo ${step.position + 1}` });
  }

  async function runFromHere(fromIdx: number) {
    abortRef.current = false;
    const slice = steps.slice(fromIdx);
    setSeq({ current: 0, total: slice.length });
    setOpen(false);
    for (let i = 0; i < slice.length; i++) {
      if (abortRef.current) { toast({ title: "⏹ Sequência interrompida" }); break; }
      setSeq({ current: i + 1, total: slice.length });
      const ok = await invokeStep(slice[i].id);
      if (!ok) { abortRef.current = true; break; }
      if (i < slice.length - 1) await new Promise((r) => setTimeout(r, 1200));
    }
    if (!abortRef.current) toast({ title: "✅ Sequência concluída" });
    setSeq(null);
  }

  if (!consultantId || !customerId) return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary relative"
            disabled={disabled || !!seq}
            title="Enviar passo do fluxo"
          >
            {seq ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Zap className="h-4 w-4" />}
            {seq && (
              <span className="absolute -top-1 -right-1 text-[9px] bg-primary text-primary-foreground rounded-full px-1 leading-tight">
                {seq.current}/{seq.total}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-80 p-0">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Enviar passo do fluxo para</p>
              <p className="text-sm font-semibold truncate">{customerName || customerId}</p>
            </div>
            {steps.length > 0 && <Badge variant="secondary" className="text-[10px] shrink-0">{steps.length} passos</Badge>}
          </div>

          {seq && (
            <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span className="text-xs text-foreground flex-1">Enviando {seq.current}/{seq.total}…</span>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive"
                onClick={() => { abortRef.current = true; }}>
                <StopCircle className="w-3 h-3 mr-1" /> Parar
              </Button>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : steps.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6 px-3">Nenhum passo configurado neste consultor.</p>
            ) : (
              steps.map((s, i) => {
                const isSending = sendingId === s.id;
                return (
                  <div key={s.id} className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-secondary/40 rounded-md mx-1">
                    <span className="text-[10px] font-mono text-muted-foreground w-5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-xs text-foreground flex-1 truncate" title={s.title || s.step_key || ""}>
                      {s.title || s.step_key || `Passo ${i + 1}`}
                    </span>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-primary hover:bg-primary/10"
                      title="Enviar passo completo (auto)"
                      disabled={isSending || !!seq}
                      onClick={() => sendFull(s)}>
                      {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7"
                      title="Enviar 1 a 1 (escolher cada mídia)"
                      disabled={!!seq}
                      onClick={() => { setOneByOneStepId(s.id); setOpen(false); }}>
                      <ListChecks className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-500 hover:bg-amber-500/10"
                      title="Enviar este passo e todos os seguintes (auto)"
                      disabled={!!seq}
                      onClick={() => setConfirmFrom(i)}>
                      <FastForward className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-border px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><Send className="w-3 h-3" /> Completo</span>
              <span className="flex items-center gap-1"><ListChecks className="w-3 h-3" /> 1 a 1</span>
              <span className="flex items-center gap-1"><FastForward className="w-3 h-3" /> Daqui</span>
            </div>
            <a href="/admin/fluxos" target="_blank" rel="noreferrer"
              className="text-[10px] text-primary hover:underline flex items-center gap-1">
              Editar <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirmFrom !== null} onOpenChange={(o) => !o && setConfirmFrom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar daqui em diante?</AlertDialogTitle>
            <AlertDialogDescription>
              Vou enviar <strong>{confirmFrom !== null ? steps.length - confirmFrom : 0} passos</strong> em sequência
              para <strong>{customerName || customerId}</strong>, começando em{" "}
              <strong>{confirmFrom !== null ? (steps[confirmFrom]?.title || steps[confirmFrom]?.step_key || `Passo ${confirmFrom + 1}`) : ""}</strong>.
              Você pode interromper a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const f = confirmFrom!; setConfirmFrom(null); runFromHere(f); }}>
              Enviar sequência
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {oneByOneStepId && consultantId && customerId && (
        <ManualStepDialog
          open={!!oneByOneStepId}
          onOpenChange={(o) => { if (!o) setOneByOneStepId(null); }}
          consultantId={consultantId}
          customerId={customerId}
          customerName={customerName || null}
          initialStepId={oneByOneStepId}
        />
      )}
    </>
  );
}
