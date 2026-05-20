import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Check, Mic, ImageIcon, Video, Search } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  consultantId: string;
  customerId: string;
  sentSteps: Set<string>;
  onSent: (stepId: string) => void;
}

interface StepRow {
  id: string;
  title: string | null;
  step_key: string | null;
  position: number;
  message_text: string | null;
  media_order: unknown;
}


export function CaptureStepsList({ consultantId, customerId, sentSteps, onSent }: Props) {
  const { toast } = useToast();
  const [sending, setSending] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [query, setQuery] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [confirmStep, setConfirmStep] = useState<StepRow | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: flows } = await supabase
        .from("bot_flows").select("id")
        .eq("consultant_id", consultantId).eq("is_active", true).limit(1);
      if (!flows?.[0]) { if (mounted) setSteps([]); return; }
      const { data } = await supabase
        .from("bot_flow_steps")
        .select("id, title, step_key, position, message_text, audio_url, image_url, video_url")
        .eq("flow_id", flows[0].id)
        .eq("is_active", true)
        .order("position", { ascending: true })
        .limit(10);
      if (mounted) setSteps((data as StepRow[]) || []);
    })();
    return () => { mounted = false; };
  }, [consultantId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return steps.filter((s) => {
      if (onlyPending && sentSteps.has(s.id)) return false;
      if (!q) return true;
      return (s.title || "").toLowerCase().includes(q) ||
        (s.step_key || "").toLowerCase().includes(q) ||
        (s.message_text || "").toLowerCase().includes(q);
    });
  }, [steps, query, onlyPending, sentSteps]);

  const doSend = async (s: StepRow) => {
    setSending(s.id);
    try {
      const { data, error } = await supabase.functions.invoke("manual-step-send", {
        body: { consultantId, customerId, stepId: s.id, part: "all", continueFlow: false },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      onSent(s.id);
      toast({ title: "Passo enviado ✓", description: s.title || s.step_key || "" });
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSending(null);
      setConfirmStep(null);
    }
  };

  if (steps.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
        Nenhum passo configurado. Vá em <span className="font-semibold">/admin/fluxos</span>.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 sticky top-0 z-10 bg-background/95 backdrop-blur py-2 -mx-1 px-1">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar passo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Button
          size="sm"
          variant={onlyPending ? "default" : "outline"}
          className="h-9 px-3 text-xs whitespace-nowrap"
          onClick={() => setOnlyPending((v) => !v)}
        >
          Só pendentes
        </Button>
      </div>

      <ul className="space-y-2">
        {filtered.map((s, i) => {
          const sent = sentSteps.has(s.id);
          const isSending = sending === s.id;
          const num = steps.findIndex((x) => x.id === s.id) + 1;
          const preview = (s.message_text || "").replace(/\s+/g, " ").trim();
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={isSending}
                onClick={() => setConfirmStep(s)}
                className={`w-full text-left rounded-xl border p-3 transition-all active:scale-[0.99] ${
                  sent
                    ? "border-primary/30 bg-primary/5 opacity-70"
                    : "border-border bg-card hover:border-primary/50 hover:shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-bold text-primary tabular-nums shrink-0">#{num}</span>
                    <span className="text-sm font-semibold truncate">
                      {s.title || s.step_key || `Passo ${num}`}
                    </span>
                  </div>
                  {sent ? (
                    <span className="flex items-center gap-1 text-[10px] text-primary font-semibold shrink-0">
                      <Check className="w-3.5 h-3.5" /> enviado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-primary shrink-0">
                      {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Send className="w-3.5 h-3.5" /> Enviar</>}
                    </span>
                  )}
                </div>
                {preview && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mb-1">{preview}</p>
                )}
                <div className="flex items-center gap-1.5 text-muted-foreground/70">
                  {s.audio_url && <Mic className="w-3 h-3 text-emerald-500" />}
                  {s.image_url && <ImageIcon className="w-3 h-3 text-amber-500" />}
                  {s.video_url && <Video className="w-3 h-3 text-cyan-500" />}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <AlertDialog open={!!confirmStep} onOpenChange={(o) => !o && setConfirmStep(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar este passo?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block font-semibold mb-1">
                {confirmStep?.title || confirmStep?.step_key}
              </span>
              {confirmStep?.message_text && (
                <span className="block text-xs line-clamp-4 italic">
                  "{confirmStep.message_text}"
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmStep && doSend(confirmStep)}>
              <Send className="w-3.5 h-3.5 mr-1" /> Enviar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
