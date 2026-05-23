import { useEffect, useState, useRef } from "react";
import { CAPTURE_FIELDS, CaptureFieldKey, useCaptureSession } from "@/hooks/useCaptureSession";
import { useCaptureSuggestions } from "@/hooks/useCaptureSuggestions";
import { useCaptureGameState } from "@/hooks/useCaptureGameState";
import { CaptureHud } from "./CaptureHud";
import { XpFloater } from "./XpFloater";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Edit2, Loader2, Trophy, X, Bot } from "lucide-react";
import { fireRandomCelebration, MOTIVATIONAL_PHRASES, pickRandomPhrase } from "@/lib/captureGame";
import { sfxPop, sfxLevelUp, sfxVictory, sfxCombo } from "@/lib/captureSfx";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CaptureDocumentTiles } from "./CaptureDocumentTiles";
import { CaptureDataConfirmCard } from "./CaptureDataConfirmCard";
import { bumpMission } from "./CaptureMissionsPanel";


interface Props {
  customerId: string;
  onSubmitted?: () => void;
  embedded?: boolean;
  sentStepsCount?: number;
}

export function CaptureLeadCard({ customerId, onSubmitted, embedded = false, sentStepsCount = 0 }: Props) {
  const { customer, loading, filledCount, totalFields, progress, updateField } = useCaptureSession(customerId);
  const { suggestions, resolve } = useCaptureSuggestions(customerId);
  const { toast } = useToast();
  const lastCountRef = useRef<number>(0);
  const lastToastRef = useRef<number>(0);
  const [editing, setEditing] = useState<CaptureFieldKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const prevTier = useRef<number>(-1);

  const game = useCaptureGameState({ filledCount, totalFields, sentStepsCount });

  const suggestionByField = new Map(suggestions.map((s) => [s.field_name, s]));

  const safeToast = (opts: Parameters<typeof toast>[0]) => {
    const now = Date.now();
    if (now - lastToastRef.current < 2500) return;
    lastToastRef.current = now;
    toast(opts);
  };

  const acceptSuggestion = async (key: CaptureFieldKey) => {
    const s = suggestionByField.get(key);
    if (!s) return;
    try {
      let value: any = s.suggested_value;
      if (key === "electricity_bill_value") value = Number(String(value).replace(",", ".")) || null;
      await updateField(key, value);
      await resolve(s.id, "accepted");
      if (customer?.consultant_id) bumpMission(customer.consultant_id, "aiAccepts");
      sfxPop();
      fireRandomCelebration();
      safeToast({ title: `🤖 IA capturou ${key}!`, duration: 1800 });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || String(e), variant: "destructive" });
    }
  };

  useEffect(() => {
    if (loading || !customer) { lastCountRef.current = filledCount; return; }
    const prev = lastCountRef.current;
    if (filledCount > prev && prev >= 0) {
      // flash last field
      const last = [...CAPTURE_FIELDS].reverse().find((f) => {
        const v = (customer as any)[f.key];
        return v !== null && v !== undefined && String(v).trim() !== "";
      });
      if (last) {
        setFlashKey(last.key);
        setTimeout(() => setFlashKey(null), 700);
      }
      sfxPop();
      if (game.combo > 0) sfxCombo(game.combo);

      // milestones only
      if ([3, 5, 7, 10].includes(filledCount)) {
        const phrase = MOTIVATIONAL_PHRASES[filledCount] || pickRandomPhrase();
        if (phrase) safeToast({ title: phrase, duration: 2200 });
        fireRandomCelebration();
      }
    }
    lastCountRef.current = filledCount;
  }, [filledCount, totalFields, loading, customer]); // eslint-disable-line

  // level up sfx
  useEffect(() => {
    if (prevTier.current >= 0 && game.tier.index > prevTier.current) {
      sfxLevelUp();
      fireRandomCelebration();
      safeToast({ title: `🆙 LEVEL UP — ${game.tier.name}!`, duration: 2200 });
    }
    prevTier.current = game.tier.index;
  }, [game.tier.index]); // eslint-disable-line

  const startEdit = (key: CaptureFieldKey) => {
    setEditing(key);
    const v = customer ? (customer as any)[key] : "";
    setEditValue(v ?? "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      let value: any = editValue;
      if (editing === "electricity_bill_value") value = Number(String(editValue).replace(",", ".")) || null;
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
      await supabase.from("customers").update({
        conversation_step: "finalizando",
      }).eq("id", customer.id);
      bumpMission(customer.consultant_id, "leads");
      sfxVictory();
      fireRandomCelebration();
      setTimeout(() => fireRandomCelebration(), 400);
      setTimeout(() => fireRandomCelebration(), 800);
      toast({
        title: "🏆 +100 XP — CADASTRO ENVIADO!",
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
    <aside className={embedded
      ? "w-full h-full flex flex-col bg-transparent overflow-hidden"
      : "w-full h-full min-w-0 shrink-0 flex flex-col border-l border-border bg-card/40 backdrop-blur-sm overflow-y-auto"}>
      <XpFloater events={game.events} />

      {!embedded && (
        <CaptureHud
          tier={game.tier}
          combo={game.combo}
          xp={game.xp}
          filled={filledCount}
          total={totalFields}
          progress={progress}
          missionLabel={game.nextMissionLabel}
          canSubmit={canSubmit}
        />
      )}

      {/* Embedded: 2 colunas (ficha | docs) em md+, stacked compacto no mobile */}
      <div className={embedded ? "flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1fr_200px] gap-0 overflow-hidden" : "contents"}>
        <div className={`overflow-y-auto ${embedded ? "p-2 space-y-1" : "p-3 space-y-1.5"}`}>
          <CaptureDataConfirmCard kind="bill" customer={customer} />
          <CaptureDataConfirmCard kind="doc" customer={customer} />
          {CAPTURE_FIELDS.filter((f) => f.key !== "document_front_url").map(f => {
            const v = (customer as any)[f.key];
            const filled = v !== null && v !== undefined && String(v).trim() !== "" && (f.key !== "electricity_bill_value" || Number(v) > 0);
            const isEditingThis = editing === f.key;
            const sugg = suggestionByField.get(f.key);
            const isFlashing = flashKey === f.key;

            return (
              <div
                key={f.key}
                className={`group rounded-md border transition-all ${embedded ? "px-2 py-1" : "p-2"} ${
                  isFlashing ? "animate-exec-card border-primary bg-primary/10" :
                  sugg ? "border-amber-400/60 bg-amber-400/5 ring-1 ring-amber-400/30 animate-pulse" :
                  filled ? "border-primary/30 bg-primary/5" : "border-border bg-background hover:border-primary/30"
                }`}
              >
                {/* Linha única: ícone + label + valor + edit (densa quando embedded) */}
                <div className="flex items-center gap-1.5 min-w-0">
                  {filled ? <Check className="w-3 h-3 text-primary shrink-0" /> : <div className="w-3 h-3 rounded-full border-2 border-muted-foreground/30 shrink-0" />}
                  <span className={`font-semibold uppercase tracking-wide text-muted-foreground shrink-0 ${embedded ? "text-[9px] w-16" : "text-[11px]"}`}>{f.label}</span>
                  {!isEditingThis && (
                    <span className={`flex-1 min-w-0 truncate ${embedded ? "text-[11px]" : "text-xs"} ${filled ? "text-foreground" : "text-muted-foreground italic"}`} title={filled ? String(v) : undefined}>
                      {filled ? String(v) : "vazio"}
                    </span>
                  )}
                  {!isEditingThis && (
                    <button onClick={() => startEdit(f.key)} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Edit2 className="w-3 h-3 text-muted-foreground hover:text-primary" />
                    </button>
                  )}
                </div>
                {isEditingThis && (
                  <div className="mt-1 flex items-center gap-1">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(); if (e.key === "Escape") setEditing(null); }}
                      autoFocus
                      className="h-6 text-xs"
                    />
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => void saveEdit()}><Check className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(null)}><X className="w-3 h-3" /></Button>
                  </div>
                )}
                {sugg && !isEditingThis && (
                  <div className="mt-1 flex items-center gap-1 rounded bg-amber-400/10 border border-amber-400/40 px-1 py-0.5">
                    <Bot className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-[10px] flex-1 truncate text-amber-700 dark:text-amber-300">
                      IA: <strong>{sugg.suggested_value}</strong>
                    </span>
                    <Button size="icon" variant="ghost" className="h-5 w-5 text-emerald-500 hover:text-emerald-600" onClick={() => void acceptSuggestion(f.key)} title="Aceitar">
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => { setEditing(f.key); setEditValue(sugg.suggested_value); void resolve(sugg.id, "edited"); }} title="Editar">
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground" onClick={() => void resolve(sugg.id, "dismissed")} title="Descartar">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Documentos: coluna direita em md+, linha abaixo no mobile */}
        <div className={embedded ? "md:border-l md:border-border/60 md:overflow-y-auto border-t md:border-t-0" : "contents"}>
          <CaptureDocumentTiles
            customerId={customerId}
            customer={customer}
            onUploaded={async (key, url) => { await updateField(key as any, url); }}
            compact={embedded}
          />
        </div>
      </div>


      {!embedded && (
        <div className="p-3 border-t border-border space-y-2">
          <Button
            size="lg"
            className={`w-full gap-2 font-black text-base ${canSubmit
              ? "bg-gradient-to-r from-primary via-emerald-400 to-primary bg-[length:200%_100%] text-primary-foreground hover:opacity-95 exec-bar-active shadow-[0_0_24px_hsl(var(--primary)/0.4)]"
              : ""}`}
            disabled={!canSubmit || submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
            {canSubmit ? "FINALIZAR CADASTRO" : "CADASTRAR TUDO"}
          </Button>
          <p className="text-[10px] text-center text-muted-foreground">
            {canSubmit ? "Cadastro completo — confirme para registrar." : `Faltam ${totalFields - filledCount} ${totalFields - filledCount === 1 ? "dado" : "dados"}.`}
          </p>
        </div>
      )}
    </aside>
  );
}
