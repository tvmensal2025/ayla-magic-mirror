import { useEffect, useState, useRef } from "react";
import { CAPTURE_FIELDS, CaptureFieldKey, useCaptureSession } from "@/hooks/useCaptureSession";
import { useCaptureSuggestions } from "@/hooks/useCaptureSuggestions";
import { CaptureProgressBar } from "./CaptureProgressBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Edit2, FileImage, Loader2, Sparkles, Trophy, X, Bot } from "lucide-react";
import { fireMiniConfetti, fireBigConfetti, MOTIVATIONAL_PHRASES } from "@/lib/captureGame";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";


interface Props {
  customerId: string;
  onSubmitted?: () => void;
}

export function CaptureLeadCard({ customerId, onSubmitted }: Props) {
  const { customer, loading, filledCount, totalFields, progress, updateField } = useCaptureSession(customerId);
  const { suggestions, resolve } = useCaptureSuggestions(customerId);
  const { toast } = useToast();
  const lastCountRef = useRef<number>(0);
  const [editing, setEditing] = useState<CaptureFieldKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const suggestionByField = new Map(suggestions.map((s) => [s.field_name, s]));

  const acceptSuggestion = async (key: CaptureFieldKey) => {
    const s = suggestionByField.get(key);
    if (!s) return;
    try {
      let value: any = s.suggested_value;
      if (key === "electricity_bill_value") value = Number(String(value).replace(",", ".")) || null;
      await updateField(key, value);
      await resolve(s.id, "accepted");
      fireMiniConfetti();
      toast({ title: `🤖 IA capturou ${key}!`, duration: 1800 });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || String(e), variant: "destructive" });
    }
  };


  useEffect(() => {
    if (loading || !customer) { lastCountRef.current = filledCount; return; }
    const prev = lastCountRef.current;
    if (filledCount > prev && prev >= 0) {
      const phrase = MOTIVATIONAL_PHRASES[filledCount];
      if (phrase) toast({ title: phrase, duration: 2200 });
      if (filledCount === totalFields) fireBigConfetti();
      else fireMiniConfetti();
    }
    lastCountRef.current = filledCount;
  }, [filledCount, totalFields, loading, customer, toast]);

  const startEdit = (key: CaptureFieldKey) => {
    setEditing(key);
    const v = customer ? (customer as any)[key] : "";
    setEditValue(v ?? "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      let value: any = editValue;
      if (editing === "electricity_bill_value") {
        value = Number(String(editValue).replace(",", ".")) || null;
      }
      if (typeof value === "string") value = value.trim() || null;
      await updateField(editing, value);
      setEditing(null);
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message || String(e), variant: "destructive" });
    }
  };

  const handleSubmit = async () => {
    if (!customer) return;
    setSubmitting(true);
    try {
      // Marca como "finalizando" — o cron/portal-worker pega via polling
      await supabase.from("customers").update({
        conversation_step: "finalizando",
        capture_mode: "auto",
      }).eq("id", customer.id);
      fireBigConfetti();
      toast({
        title: "🎉 Cadastro enviado!",
        description: "O Portal Worker vai concluir o envio em alguns segundos.",
        duration: 4000,
      });
      onSubmitted?.();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !customer) {
    return <div className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>;
  }

  const canSubmit = filledCount === totalFields;

  return (
    <aside className="w-80 shrink-0 flex flex-col border-l border-border bg-card/40 backdrop-blur-sm overflow-y-auto">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Ficha do Lead</h3>
        </div>
        <CaptureProgressBar progress={progress} filled={filledCount} total={totalFields} />
        {canSubmit && (
          <div className="text-[11px] text-center text-emerald-500 font-semibold animate-pulse">
            ⚡ Tudo pronto! Aperta CADASTRAR
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {CAPTURE_FIELDS.map(f => {
          const v = (customer as any)[f.key];
          const filled = v !== null && v !== undefined && String(v).trim() !== "" && (f.key !== "electricity_bill_value" || Number(v) > 0);
          const isDoc = f.key === "document_front_url";
          const isEditingThis = editing === f.key;
          const sugg = suggestionByField.get(f.key);

          return (
            <div
              key={f.key}
              className={`group rounded-md border p-2 transition-all ${
                sugg ? "border-amber-400/60 bg-amber-400/5 ring-1 ring-amber-400/30 animate-pulse" :
                filled ? "border-primary/30 bg-primary/5" : "border-border bg-background hover:border-primary/30"
              }`}
            >

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {filled ? <Check className="w-3.5 h-3.5 text-primary shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30 shrink-0" />}
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{f.label}</span>
                </div>
                {!isEditingThis && !isDoc && (
                  <button onClick={() => startEdit(f.key)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Edit2 className="w-3 h-3 text-muted-foreground hover:text-primary" />
                  </button>
                )}
              </div>
              {isEditingThis ? (
                <div className="mt-1.5 flex items-center gap-1">
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(); if (e.key === "Escape") setEditing(null); }}
                    autoFocus
                    className="h-7 text-xs"
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void saveEdit()}><Check className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(null)}><X className="w-3.5 h-3.5" /></Button>
                </div>
              ) : isDoc ? (
                <div className="mt-1 flex gap-1.5">
                  {customer.document_front_url ? (
                    <a href={customer.document_front_url} target="_blank" rel="noreferrer" className="block w-14 h-14 rounded border border-border overflow-hidden bg-secondary hover:ring-2 hover:ring-primary">
                      <img src={customer.document_front_url} className="w-full h-full object-cover" alt="frente" />
                    </a>
                  ) : <div className="w-14 h-14 rounded border border-dashed border-border flex items-center justify-center"><FileImage className="w-4 h-4 text-muted-foreground/50" /></div>}
                  {customer.document_back_url && (
                    <a href={customer.document_back_url} target="_blank" rel="noreferrer" className="block w-14 h-14 rounded border border-border overflow-hidden bg-secondary hover:ring-2 hover:ring-primary">
                      <img src={customer.document_back_url} className="w-full h-full object-cover" alt="verso" />
                    </a>
                  )}
                  {customer.electricity_bill_photo_url && (
                    <a href={customer.electricity_bill_photo_url} target="_blank" rel="noreferrer" className="block w-14 h-14 rounded border border-border overflow-hidden bg-secondary hover:ring-2 hover:ring-primary" title="Conta de luz">
                      <img src={customer.electricity_bill_photo_url} className="w-full h-full object-cover" alt="conta" />
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-xs mt-0.5 break-words text-foreground/80 min-h-[1rem]">{filled ? String(v) : <span className="text-muted-foreground italic">vazio</span>}</p>
              )}
              {sugg && !isEditingThis && (
                <div className="mt-1.5 flex items-center gap-1 rounded bg-amber-400/10 border border-amber-400/40 p-1">
                  <Bot className="w-3 h-3 text-amber-500 shrink-0" />
                  <span className="text-[11px] flex-1 truncate text-amber-700 dark:text-amber-300">
                    IA: <strong>{sugg.suggested_value}</strong>
                  </span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-500 hover:text-emerald-600" onClick={() => void acceptSuggestion(f.key)} title="Aceitar">
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditing(f.key); setEditValue(sugg.suggested_value); void resolve(sugg.id, "edited"); }} title="Editar">
                    <Edit2 className="w-3 h-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => void resolve(sugg.id, "dismissed")} title="Descartar">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>

          );
        })}
      </div>

      <div className="p-3 border-t border-border space-y-2">
        <Button
          size="lg"
          className="w-full gap-2 font-bold text-base"
          disabled={!canSubmit || submitting}
          onClick={() => void handleSubmit()}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
          CADASTRAR TUDO
        </Button>
        <p className="text-[10px] text-center text-muted-foreground">
          {canSubmit ? "Pronto pra enviar ao portal." : `Faltam ${totalFields - filledCount} ${totalFields - filledCount === 1 ? "dado" : "dados"}.`}
        </p>
      </div>
    </aside>
  );
}
