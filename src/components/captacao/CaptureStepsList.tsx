import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Check, Mic, ImageIcon, Video, Search, Eye } from "lucide-react";
import { CaptureStepPreview } from "./CaptureStepPreview";

interface Props {
  consultantId: string;
  customerId: string;
  sentSteps: Set<string>;
  onSent: (stepId: string) => void;
  defaultVariant?: string | null;
}

interface StepRow {
  id: string;
  title: string | null;
  step_key: string | null;
  position: number;
  message_text: string | null;
  media_order: unknown;
  variant: string;
  flow_id: string;
}

interface StepGroup {
  step_key: string;
  position: number;
  title: string | null;
  preview: string;
  variants: Record<string, StepRow>; // A/B/C → StepRow
}

const VARIANT_META: Record<string, { label: string; hint: string }> = {
  A: { label: "A", hint: "com áudio" },
  B: { label: "B", hint: "só texto" },
  C: { label: "C", hint: "com vídeo" },
};

export function CaptureStepsList({ consultantId, customerId, sentSteps, onSent, defaultVariant }: Props) {
  const { toast } = useToast();
  const [sending, setSending] = useState<string | null>(null);
  const [groups, setGroups] = useState<StepGroup[]>([]);
  const [query, setQuery] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [confirmStep, setConfirmStep] = useState<{ group: StepGroup; row: StepRow } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // Carrega TODOS os fluxos ativos do consultor (A, B, C…)
      const { data: flows } = await supabase
        .from("bot_flows")
        .select("id, variant, updated_at")
        .eq("consultant_id", consultantId)
        .eq("is_active", true)
        .order("updated_at", { ascending: false });
      let flowList = (flows || []) as Array<{ id: string; variant: string }>;
      if (flowList.length === 0) {
        // fallback: pega o mais recente (mesmo se inativo)
        const { data: anyFlow } = await supabase
          .from("bot_flows")
          .select("id, variant, updated_at")
          .eq("consultant_id", consultantId)
          .order("updated_at", { ascending: false }).limit(1);
        flowList = (anyFlow || []) as any;
      }
      if (flowList.length === 0) { if (mounted) setGroups([]); return; }

      // Deduplica variantes (uma por letra, a mais recente)
      const byVariant = new Map<string, { id: string; variant: string }>();
      for (const f of flowList) {
        const v = (f.variant || "A").toUpperCase();
        if (!byVariant.has(v)) byVariant.set(v, { ...f, variant: v });
      }

      const flowIds = Array.from(byVariant.values()).map((f) => f.id);
      const variantByFlow = new Map(Array.from(byVariant.values()).map((f) => [f.id, f.variant]));

      const { data: stepsData } = await supabase
        .from("bot_flow_steps")
        .select("id, title, step_key, position, message_text, media_order, flow_id")
        .in("flow_id", flowIds)
        .eq("is_active", true)
        .order("position", { ascending: true });

      const allRows: StepRow[] = ((stepsData || []) as any[]).map((s) => ({
        ...s,
        variant: variantByFlow.get(s.flow_id) || "A",
      }));

      // Agrupa por step_key (ou position se sem key). Variante A define ordem canônica.
      const groupMap = new Map<string, StepGroup>();
      // Primeiro passa A para fixar ordem
      const aRows = allRows.filter((r) => r.variant === "A");
      const orderedKeys: string[] = [];
      for (const r of aRows) {
        const key = r.step_key || `pos_${r.position}`;
        if (!groupMap.has(key)) {
          orderedKeys.push(key);
          groupMap.set(key, {
            step_key: key,
            position: r.position,
            title: r.title,
            preview: (r.message_text || "").replace(/\s+/g, " ").trim(),
            variants: {},
          });
        }
        groupMap.get(key)!.variants[r.variant] = r;
      }
      // Demais variantes (B/C…) anexam à mesma key
      for (const r of allRows) {
        if (r.variant === "A") continue;
        const key = r.step_key || `pos_${r.position}`;
        if (!groupMap.has(key)) {
          orderedKeys.push(key);
          groupMap.set(key, {
            step_key: key,
            position: r.position,
            title: r.title,
            preview: (r.message_text || "").replace(/\s+/g, " ").trim(),
            variants: {},
          });
        } else if (!groupMap.get(key)!.title) {
          groupMap.get(key)!.title = r.title;
        }
        groupMap.get(key)!.variants[r.variant] = r;
      }

      const ordered = orderedKeys
        .map((k) => groupMap.get(k)!)
        .filter(Boolean)
        .slice(0, 10);

      if (mounted) setGroups(ordered);
    })();
    return () => { mounted = false; };
  }, [consultantId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      const allVariantIds = Object.values(g.variants).map((v) => v.id);
      const groupSent = allVariantIds.some((id) => sentSteps.has(id));
      if (onlyPending && groupSent) return false;
      if (!q) return true;
      return (g.title || "").toLowerCase().includes(q) ||
        (g.step_key || "").toLowerCase().includes(q) ||
        g.preview.toLowerCase().includes(q);
    });
  }, [groups, query, onlyPending, sentSteps]);

  const doSend = async (row: StepRow) => {
    setSending(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("manual-step-send", {
        body: { consultantId, customerId, stepId: row.id, part: "all", continueFlow: false },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      onSent(row.id);
      toast({
        title: `Passo enviado ✓ (${row.variant})`,
        description: row.title || row.step_key || "",
      });
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSending(null);
      setConfirmStep(null);
    }
  };

  if (groups.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
        Nenhum passo configurado. Vá em <span className="font-semibold">/admin/fluxos</span>.
      </div>
    );
  }

  const defaultV = (defaultVariant || "A").toUpperCase();

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
        {filtered.map((g) => {
          const num = groups.findIndex((x) => x.step_key === g.step_key) + 1;
          const variantKeys = Object.keys(g.variants).sort();
          const anySent = variantKeys.some((v) => sentSteps.has(g.variants[v].id));
          const media = (() => {
            const ref = g.variants[defaultV] || g.variants[variantKeys[0]];
            const mo = Array.isArray(ref?.media_order) ? (ref.media_order as string[]) : [];
            return mo;
          })();
          return (
            <li key={g.step_key}>
              <div
                className={`rounded-xl border p-3 transition-all ${
                  anySent
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-bold text-primary tabular-nums shrink-0">#{num}</span>
                    <span className="text-sm font-semibold truncate">
                      {g.title || g.step_key || `Passo ${num}`}
                    </span>
                  </div>
                  {anySent && (
                    <span className="flex items-center gap-1 text-[10px] text-primary font-semibold shrink-0">
                      <Check className="w-3.5 h-3.5" /> enviado
                    </span>
                  )}
                </div>
                {g.preview && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{g.preview}</p>
                )}
                <div className="flex items-center gap-1.5 text-muted-foreground/70 mb-2">
                  {media.includes("audio") && <Mic className="w-3 h-3 text-emerald-500" />}
                  {media.includes("image") && <ImageIcon className="w-3 h-3 text-amber-500" />}
                  {media.includes("video") && <Video className="w-3 h-3 text-cyan-500" />}
                </div>

                {/* Botões A / B / C */}
                <div className="flex flex-wrap gap-1.5">
                  {variantKeys.map((v) => {
                    const row = g.variants[v];
                    const isSending = sending === row.id;
                    const sent = sentSteps.has(row.id);
                    const isDefault = v === defaultV;
                    const meta = VARIANT_META[v] || { label: v, hint: "" };
                    return (
                      <Button
                        key={v}
                        size="sm"
                        variant={sent ? "outline" : isDefault ? "default" : "secondary"}
                        disabled={isSending}
                        onClick={() => setConfirmStep({ group: g, row })}
                        className="h-8 px-2.5 text-[11px] gap-1"
                      >
                        {isSending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : sent ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Send className="w-3 h-3" />
                        )}
                        <span className="font-bold">{meta.label}</span>
                        <span className="opacity-70">{meta.hint}</span>
                      </Button>
                    );
                  })}
                  {variantKeys.length === 1 && (
                    <span className="text-[10px] text-muted-foreground self-center">
                      (só variante {variantKeys[0]} configurada)
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <AlertDialog open={!!confirmStep} onOpenChange={(o) => !o && setConfirmStep(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Enviar variante {confirmStep?.row.variant}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block font-semibold mb-1">
                {confirmStep?.group.title || confirmStep?.group.step_key}
              </span>
              {confirmStep?.row.message_text && (
                <span className="block text-xs line-clamp-4 italic">
                  "{confirmStep.row.message_text}"
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmStep && doSend(confirmStep.row)}>
              <Send className="w-3.5 h-3.5 mr-1" /> Enviar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
