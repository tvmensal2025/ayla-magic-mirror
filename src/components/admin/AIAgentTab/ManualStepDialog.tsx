import { useEffect, useRef, useState } from "react";
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
  captures?: any;
};

function extractStepButtons(step: Step | undefined | null): { id: string; title: string }[] {
  if (!step) return [];
  try {
    const caps = Array.isArray((step as any).captures) ? (step as any).captures : [];
    const found = caps.find((c: any) => c?.field === "_buttons" && c?.enabled !== false);
    if (found && Array.isArray(found.value)) {
      return found.value
        .map((b: any) => ({ id: String(b?.id || "").trim(), title: String(b?.title || "").trim() }))
        .filter((b: any) => b.id && b.title)
        .slice(0, 3);
    }
  } catch {}
  return [];
}

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
  const [variant, setVariant] = useState<"A" | "B" | "C" | "D" | "E">("A");
  const [variantsAvailable, setVariantsAvailable] = useState<Array<"A" | "B" | "C" | "D" | "E">>(["A"]);
  const byVariantRef = useRef<Map<"A" | "B" | "C" | "D" | "E", string>>(new Map());

  // Efeito 1 — inicialização: define variante default a partir do cliente
  // sem reagir a mudanças posteriores em `variant` (clique manual não pode
  // ser revertido pela flow_variant do cliente).
  useEffect(() => {
    if (!open) { setSelectedStep(null); setParts([]); setPartIdx(0); return; }
    let mounted = true;
    (async () => {
      setLoading(true);

      const { data: cust } = await supabase
        .from("customers").select("flow_variant")
        .eq("id", customerId).maybeSingle();
      const custVariant = String((cust as { flow_variant?: string } | null)?.flow_variant || "A").toUpperCase() as "A" | "B" | "C" | "D" | "E";

      const { data: flowsAll } = await supabase
        .from("bot_flows").select("id, variant, created_at")
        .eq("consultant_id", consultantId).eq("is_active", true)
        .order("created_at", { ascending: false });
      const flowsList = ((flowsAll as Array<{ id: string; variant: string }> | null) || []);
      const byVariant = new Map<"A" | "B" | "C" | "D" | "E", string>();
      flowsList.forEach((f) => {
        const v = String(f.variant || "A").toUpperCase() as "A" | "B" | "C" | "D" | "E";
        if (["A", "B", "C", "D", "E"].includes(v) && !byVariant.has(v)) byVariant.set(v, f.id);
      });
      byVariantRef.current = byVariant;
      const available = (["A", "B", "C", "D", "E"] as const).filter((v) => byVariant.has(v));
      if (!mounted) return;
      setVariantsAvailable(available.length > 0 ? available : ["A"]);

      const selected: "A" | "B" | "C" | "D" | "E" = byVariant.has(custVariant) ? custVariant : (available[0] || "A");
      setVariant(selected);
      // Os passos serão carregados pelo Efeito 2 ao reagir a `variant`.
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [open, consultantId, customerId]);

  // Efeito 2 — troca manual: recarrega só os passos da variante escolhida,
  // sem mexer em `variant` nem reler flow_variant.
  useEffect(() => {
    if (!open) return;
    const byVariant = byVariantRef.current;
    if (byVariant.size === 0) return;
    const flowId = byVariant.get(variant);
    if (!flowId) { setSteps([]); return; }
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("bot_flow_steps")
        .select("id, step_key, title, slot_key, message_text, position")
        .eq("flow_id", flowId).eq("is_active", true)
        .order("position", { ascending: true });
      if (!mounted) return;
      const list = ((data as Step[]) || []);
      setSteps(list);
      setSelectedStep(null);
      setParts([]);
      setPartIdx(0);
      setLoading(false);
      if (initialStepId) {
        const pre = list.find((s) => s.id === initialStepId);
        if (pre) loadStepParts(pre);
      }
    })();
    return () => { mounted = false; };
  }, [open, variant, initialStepId]);



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
          <DialogTitle className="flex items-center gap-2">
            Enviar passo do fluxo
            <Badge variant="outline" className="text-[10px]">Fluxo {variant}</Badge>
          </DialogTitle>
          <DialogDescription>
            Para <strong>{customerName || customerId}</strong>. ✓ Envio manual ignora pausa do bot.
          </DialogDescription>
          {/* Chips A/B/C — troca o fluxo da conversa */}
          <div className="flex items-center gap-2 pt-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Fluxo:</span>
            {(["A", "B", "C", "D", "E"] as const).map((v) => {
              const enabled = variantsAvailable.includes(v);
              const active = variant === v;
              return (
                <Button
                  key={v}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className="h-6 px-2 text-[11px] font-bold"
                  disabled={!enabled || sending}
                  onClick={() => { setVariant(v); setSelectedStep(null); setParts([]); }}
                  title={enabled ? `Usar fluxo ${v}` : `Fluxo ${v} não configurado`}
                >
                  {v}
                </Button>
              );
            })}
            <span className="text-[10px] text-muted-foreground ml-1">
              {variant === "A" ? "com áudio" : variant === "B" ? "só texto" : variant === "C" ? "com vídeo" : variant === "D" ? "botões/auto" : "custom"}
            </span>
          </div>
        </DialogHeader>


        {!selectedStep ? (
          <div className="space-y-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> :
              steps.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum passo configurado.</p> :
              variant === "D" ? (
                <div className="space-y-3 p-2">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    ⚡ O <strong className="text-foreground">Fluxo D</strong> é automático por botões. Clique abaixo para <strong>iniciar</strong> — o bot conduz o resto conforme o cliente clicar.
                  </p>
                  <Button
                    className="w-full gap-2"
                    disabled={sending}
                    onClick={async () => {
                      const first = steps[0];
                      if (!first) return;
                      setSending(true);
                      try {
                        const { data, error } = await supabase.functions.invoke("manual-step-send", {
                          body: { consultantId, customerId, stepId: first.id, part: "all", variant },
                        });
                        if (error || (data as any)?.error || (data as any)?.ok === false) {
                          throw new Error(normalizeSendStepError(error, data).message);
                        }
                        toast({ title: "▶️ Fluxo D iniciado", description: "Bot continua sozinho conforme o cliente responder." });
                        onOpenChange(false);
                      } catch (e: any) {
                        toast({ title: "Erro", description: e?.message, variant: "destructive" });
                      } finally { setSending(false); }
                    }}
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Iniciar Fluxo D (automático)
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center">
                    Primeiro passo: <strong>{steps[0]?.title || steps[0]?.step_key}</strong>
                  </p>
                </div>
              ) :
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
