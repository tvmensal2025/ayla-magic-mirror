import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Play } from "lucide-react";
import { StepPartPreview, type PartKind } from "@/components/whatsapp/StepPartPreview";
import { normalizeSendStepError } from "@/lib/whatsapp/send";

type Step = {
  id: string;
  step_key: string | null;
  title: string | null;
  slot_key: string | null;
  message_text: string | null;
  position: number;
};

type Media = { id: string; kind: string; url: string; slot_key: string | null };

type Part = { kind: "text" | "audio" | "image" | "video" | "document"; text?: string; media?: Media };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultantId: string;
  customerId: string;
  customerName: string | null;
  initialStepId?: string;
}



export function ManualStepDialog({ open, onOpenChange, consultantId, customerId, customerName, initialStepId }: Props) {
  const { toast } = useToast();
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStep, setSelectedStep] = useState<Step | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [partIdx, setPartIdx] = useState(0);
  const [sending, setSending] = useState(false);
  const [variant, setVariant] = useState<"A" | "B" | "C">("A");
  const [variantsAvailable, setVariantsAvailable] = useState<Array<"A" | "B" | "C">>(["A"]);

  useEffect(() => {
    if (!open) { setSelectedStep(null); setParts([]); setPartIdx(0); return; }
    (async () => {
      setLoading(true);

      // Descobre a variante do cliente + todas as variantes disponíveis (A/B/C).
      const { data: cust } = await supabase
        .from("customers").select("flow_variant")
        .eq("id", customerId).maybeSingle();
      const custVariant = String((cust as { flow_variant?: string } | null)?.flow_variant || "A").toUpperCase() as "A" | "B" | "C";

      const { data: flowsAll } = await supabase
        .from("bot_flows").select("id, variant, created_at")
        .eq("consultant_id", consultantId).eq("is_active", true)
        .order("created_at", { ascending: false });
      const flowsList = ((flowsAll as Array<{ id: string; variant: string }> | null) || []);
      const byVariant = new Map<"A" | "B" | "C", string>();
      flowsList.forEach((f) => {
        const v = String(f.variant || "A").toUpperCase() as "A" | "B" | "C";
        if (["A", "B", "C"].includes(v) && !byVariant.has(v)) byVariant.set(v, f.id);
      });
      const available = (["A", "B", "C"] as const).filter((v) => byVariant.has(v));
      setVariantsAvailable(available.length > 0 ? available : ["A"]);

      const selected: "A" | "B" | "C" = byVariant.has(custVariant) ? custVariant : (available[0] || "A");
      setVariant(selected);

      const flowId = byVariant.get(selected);
      if (!flowId) { setSteps([]); setLoading(false); return; }
      const { data } = await supabase
        .from("bot_flow_steps")
        .select("id, step_key, title, slot_key, message_text, position")
        .eq("flow_id", flowId).eq("is_active", true)
        .order("position", { ascending: true });
      const list = ((data as any) || []) as Step[];
      setSteps(list);
      setLoading(false);
      if (initialStepId) {
        const pre = list.find((s) => s.id === initialStepId);
        if (pre) loadStepParts(pre);
      }
    })();
  }, [open, consultantId, customerId, initialStepId, variant]);



  async function loadStepParts(step: Step) {
    setSelectedStep(step);
    setPartIdx(0);
    const slot = step.slot_key || step.step_key;
    const { data: medias } = await supabase
      .from("ai_media_library")
      .select("id, kind, url, slot_key, send_order")
      .eq("consultant_id", consultantId)
      .eq("slot_key", slot || "")
      .eq("active", true).eq("is_draft", false)
      .order("send_order", { ascending: true });
    const items: Part[] = [];
    ((medias as any[]) || []).forEach((m) => {
      if (m.url) items.push({ kind: String(m.kind || "document").toLowerCase() as any, media: m });
    });
    if (step.message_text && step.message_text.trim()) {
      items.push({ kind: "text", text: step.message_text });
    }
    setParts(items);
  }

  async function sendPart(part: Part, indexLabel: string) {
    setSending(true);
    try {
      const payload: any = {
        consultantId, customerId,
        stepId: selectedStep!.id,
        part: part.kind,
        variant,
      };
      if (part.media?.id) payload.mediaId = part.media.id;
      const { data, error } = await supabase.functions.invoke("manual-step-send", { body: payload });
      if (error || (data as any)?.error || (data as any)?.ok === false) {
        throw new Error(normalizeSendStepError(error, data).message);
      }
      toast({ title: `✅ Enviado: ${indexLabel}` });
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e?.message, variant: "destructive" });
    } finally { setSending(false); }
  }

  async function sendAll() {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("manual-step-send", {
        body: { consultantId, customerId, stepId: selectedStep!.id, part: "all", variant },
      });
      if (error || (data as any)?.error || (data as any)?.ok === false) {
        throw new Error(normalizeSendStepError(error, data).message);
      }
      toast({ title: "✅ Passo completo enviado" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally { setSending(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar passo do fluxo</DialogTitle>
          <DialogDescription>
            Para <strong>{customerName || customerId}</strong>. ✓ O envio manual ignora a pausa do bot — funciona sempre.
          </DialogDescription>
        </DialogHeader>


        {!selectedStep ? (
          <div className="space-y-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> :
              steps.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum passo configurado.</p> :
              steps.map((s, i) => (
                <Card key={s.id} className="p-3 flex items-center gap-3 hover:bg-secondary/30 cursor-pointer"
                      onClick={() => loadStepParts(s)}>
                  <span className="text-xs font-mono text-muted-foreground w-6">{String(i + 1).padStart(2, "0")}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.title || s.step_key || `Passo ${i + 1}`}</p>
                    {s.message_text && <p className="text-xs text-muted-foreground truncate">{s.message_text}</p>}
                  </div>
                  <Play className="w-4 h-4 opacity-50" />
                </Card>
              ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Passo selecionado</p>
                <p className="text-sm font-semibold">{selectedStep.title || selectedStep.step_key}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { setSelectedStep(null); setParts([]); }}>
                Trocar
              </Button>
            </div>

            {parts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Este passo não tem texto nem mídia configurada.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button size="sm" onClick={sendAll} disabled={sending} className="gap-2">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Enviar tudo (sequencial)
                  </Button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Enviar 1 a 1</p>
                  {parts.map((p, i) => {
                    const isNext = i === partIdx;
                    const wasSent = i < partIdx;
                    return (
                      <Card key={i} className={`p-3 flex items-start gap-3 ${wasSent ? "opacity-50" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <StepPartPreview
                            kind={p.kind as PartKind}
                            text={p.text}
                            url={p.media?.url}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant={isNext ? "default" : "outline"}
                          disabled={sending}
                          className="shrink-0"
                          onClick={async () => {
                            await sendPart(p, `${p.kind} (${i + 1}/${parts.length})`);
                            setPartIdx(i + 1);
                          }}
                        >
                          {sending && isNext ? <Loader2 className="w-3 h-3 animate-spin" /> : "Enviar"}
                        </Button>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
