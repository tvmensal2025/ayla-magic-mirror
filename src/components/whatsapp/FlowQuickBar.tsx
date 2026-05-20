import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Zap, Send, ListChecks, FastForward, Loader2, StopCircle, ExternalLink, Eye } from "lucide-react";
import { ManualStepDialog } from "@/components/admin/AIAgentTab/ManualStepDialog";
import { StepPartPreview, type PartKind } from "@/components/whatsapp/StepPartPreview";

type Step = { id: string; step_key: string | null; title: string | null; slot_key: string | null; message_text: string | null; position: number };
type Part = { kind: PartKind; text?: string | null; url?: string | null };

interface Props {
  consultantId?: string;
  customerId?: string;
  customerName?: string;
  disabled?: boolean;
}

async function loadStepParts(consultantId: string, step: Step): Promise<Part[]> {
  const slot = step.slot_key || step.step_key;
  const { data: medias } = await supabase
    .from("ai_media_library")
    .select("id, kind, url, send_order")
    .eq("consultant_id", consultantId)
    .eq("slot_key", slot || "")
    .eq("active", true).eq("is_draft", false)
    .order("send_order", { ascending: true });
  const items: Part[] = [];
  ((medias as Array<{ kind: string; url: string }>) || []).forEach((m) => {
    if (m.url) items.push({ kind: String(m.kind || "document").toLowerCase() as PartKind, url: m.url });
  });
  if (step.message_text && step.message_text.trim()) {
    items.push({ kind: "text", text: step.message_text });
  }
  return items;
}

export function FlowQuickBar({ consultantId, customerId, customerName, disabled }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [seq, setSeq] = useState<{ current: number; total: number } | null>(null);
  const abortRef = useRef(false);
  const [previewStep, setPreviewStep] = useState<Step | null>(null);
  const [previewParts, setPreviewParts] = useState<Part[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmFrom, setConfirmFrom] = useState<number | null>(null);
  const [fromParts, setFromParts] = useState<Record<string, Part[]>>({});
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
        .select("id, step_key, title, slot_key, message_text, position")
        .eq("flow_id", flow.id).eq("is_active", true)
        .order("position", { ascending: true });
      if (mounted) { setSteps((data as Step[]) || []); setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [open, consultantId]);

  // Load preview parts when opening the single-step preview
  useEffect(() => {
    if (!previewStep || !consultantId) return;
    let mounted = true;
    setPreviewLoading(true);
    loadStepParts(consultantId, previewStep).then((p) => {
      if (mounted) { setPreviewParts(p); setPreviewLoading(false); }
    });
    return () => { mounted = false; };
  }, [previewStep, consultantId]);

  // Load parts for "from here" sequence preview
  useEffect(() => {
    if (confirmFrom === null || !consultantId) return;
    const slice = steps.slice(confirmFrom);
    let mounted = true;
    (async () => {
      const acc: Record<string, Part[]> = {};
      for (const s of slice) {
        if (!mounted) return;
        acc[s.id] = await loadStepParts(consultantId, s);
      }
      if (mounted) setFromParts(acc);
    })();
    return () => { mounted = false; };
  }, [confirmFrom, steps, consultantId]);

  async function invokeStep(stepId: string): Promise<boolean> {
    if (!consultantId || !customerId) return false;
    const { data, error } = await supabase.functions.invoke("manual-step-send", {
      body: { consultantId, customerId, stepId, part: "all" },
    });
    if (error || (data as { error?: string })?.error) {
      const msg = error?.message || (data as { error?: string })?.error || "Falha";
      toast({ title: "Erro ao enviar passo", description: msg, variant: "destructive" });
      return false;
    }
    return true;
  }

  const confirmSendFull = useCallback(async () => {
    if (!previewStep) return;
    const step = previewStep;
    setSendingId(step.id);
    const ok = await invokeStep(step.id);
    setSendingId(null);
    setPreviewStep(null);
    if (ok) toast({ title: `✅ Passo enviado`, description: step.title || step.step_key || `Passo ${step.position + 1}` });
  }, [previewStep]); // eslint-disable-line react-hooks/exhaustive-deps

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
                      title="Pré-visualizar e enviar passo completo"
                      disabled={isSending || !!seq}
                      onClick={() => { setPreviewStep(s); setOpen(false); }}>
                      {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7"
                      title="Enviar 1 a 1 (ouvir/ver cada mídia)"
                      disabled={!!seq}
                      onClick={() => { setOneByOneStepId(s.id); setOpen(false); }}>
                      <ListChecks className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-500 hover:bg-amber-500/10"
                      title="Pré-visualizar e enviar este passo + todos os seguintes"
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
              <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> Completo</span>
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

      {/* Preview: Passo completo */}
      <Dialog open={!!previewStep} onOpenChange={(o) => !o && setPreviewStep(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pré-visualizar antes de enviar</DialogTitle>
            <DialogDescription>
              <strong>{previewStep?.title || previewStep?.step_key}</strong> → {customerName || customerId}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {previewLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : previewParts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Este passo não tem texto nem mídia configurada.</p>
            ) : (
              previewParts.map((p, i) => (
                <div key={i} className="border border-border rounded-lg p-3 bg-card">
                  <StepPartPreview kind={p.kind} text={p.text} url={p.url} />
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreviewStep(null)} disabled={!!sendingId}>Cancelar</Button>
            <Button onClick={confirmSendFull} disabled={!!sendingId || previewParts.length === 0} className="gap-2">
              {sendingId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Confirmar e enviar tudo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview: Daqui em diante */}
      <Dialog open={confirmFrom !== null} onOpenChange={(o) => { if (!o) { setConfirmFrom(null); setFromParts({}); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enviar daqui em diante?</DialogTitle>
            <DialogDescription>
              <strong>{confirmFrom !== null ? steps.length - confirmFrom : 0} passos</strong> em sequência para{" "}
              <strong>{customerName || customerId}</strong>. Expanda cada passo para ouvir/ver antes.
            </DialogDescription>
          </DialogHeader>
          {confirmFrom !== null && (
            <Accordion type="multiple" className="w-full">
              {steps.slice(confirmFrom).map((s, i) => {
                const parts = fromParts[s.id];
                return (
                  <AccordionItem key={s.id} value={s.id}>
                    <AccordionTrigger className="text-sm">
                      <span className="flex items-center gap-2 text-left">
                        <span className="text-[10px] font-mono text-muted-foreground">{String(confirmFrom + i + 1).padStart(2, "0")}</span>
                        {s.title || s.step_key || `Passo ${confirmFrom + i + 1}`}
                        {parts && <Badge variant="secondary" className="text-[9px] ml-2">{parts.length} {parts.length === 1 ? "parte" : "partes"}</Badge>}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2">
                        {!parts ? (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : parts.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sem conteúdo.</p>
                        ) : (
                          parts.map((p, j) => (
                            <div key={j} className="border border-border rounded-md p-2 bg-card">
                              <StepPartPreview kind={p.kind} text={p.text} url={p.url} compact />
                            </div>
                          ))
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setConfirmFrom(null); setFromParts({}); }}>Cancelar</Button>
            <Button
              onClick={() => { const f = confirmFrom!; setConfirmFrom(null); setFromParts({}); runFromHere(f); }}
              className="gap-2"
            >
              <FastForward className="w-4 h-4" /> Enviar sequência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
