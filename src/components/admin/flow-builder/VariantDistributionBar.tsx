import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Variant, ALL_VARIANTS, VARIANT_LABEL } from "./flowTypes";

interface Props {
  consultantId: string;
  /** Variantes que já têm fluxo criado (editáveis). */
  existingVariants: Variant[];
  /** Variante atualmente selecionada para edição. */
  editingVariant: Variant;
  onSelectVariant: (v: Variant) => void;
  /** Callback após adicionar/excluir variante para recarregar lista. */
  onChanged: () => void | Promise<void>;
}

export default function VariantDistributionBar({
  consultantId,
  existingVariants,
  editingVariant,
  onSelectVariant,
  onChanged,
}: Props) {
  const confirm = useConfirm();
  const [activeVariants, setActiveVariants] = useState<Variant[]>([]);
  const [busy, setBusy] = useState<Variant | null>(null);
  const [creating, setCreating] = useState(false);

  const loadActive = useCallback(async () => {
    const { data } = await supabase
      .from("consultants")
      .select("active_variants")
      .eq("id", consultantId)
      .maybeSingle();
    const arr = ((data as any)?.active_variants ?? ["A"]) as string[];
    setActiveVariants(arr.filter((v) => ALL_VARIANTS.includes(v as Variant)) as Variant[]);
  }, [consultantId]);

  useEffect(() => { loadActive(); }, [loadActive]);

  async function toggleActive(v: Variant, on: boolean) {
    const current = new Set(activeVariants);
    if (on) current.add(v);
    else {
      if (activeVariants.length <= 1 && activeVariants.includes(v)) {
        toast.error("Pelo menos 1 variante precisa estar ativa.");
        return;
      }
      current.delete(v);
    }
    const next = ALL_VARIANTS.filter((x) => current.has(x));
    setBusy(v);
    const { error } = await supabase
      .from("consultants")
      .update({ active_variants: next })
      .eq("id", consultantId);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    setActiveVariants(next);
    toast.success(on ? `Variante ${v} recebendo leads` : `Variante ${v} pausada (continua editável)`);
  }

  async function addVariant() {
    const next = ALL_VARIANTS.find((v) => !existingVariants.includes(v));
    if (!next) { toast.error("Todas as variantes (A–E) já existem."); return; }
    setCreating(true);
    const { data: cons } = await supabase
      .from("consultants").select("name").eq("id", consultantId).maybeSingle();
    const baseName = (cons as any)?.name ? `Fluxo de ${(cons as any).name}` : "Fluxo";
    const { error } = await (supabase as any).from("bot_flows").insert({
      consultant_id: consultantId,
      name: `${baseName} (${next})`,
      is_active: true,
      variant: next,
      initial_delay_seconds: 0,
    });
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Variante ${next} criada`);
    await onChanged();
    onSelectVariant(next);
  }

  async function deleteVariant(v: Variant) {
    if (v === "A") { toast.error("Variante A não pode ser excluída."); return; }
    const ok = await confirm({
      title: `Excluir variante ${v}?`,
      description: "Os passos desta variante serão removidos. Clientes ativos nela passarão a usar a variante A.",
      confirmText: "Excluir",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(v);
    // Remove de active_variants antes
    const nextActive = activeVariants.filter((x) => x !== v);
    if (nextActive.length === 0) nextActive.push("A");
    await supabase.from("consultants").update({ active_variants: nextActive }).eq("id", consultantId);
    // Apaga o fluxo (cascade nos steps)
    const { error } = await supabase
      .from("bot_flows").delete()
      .eq("consultant_id", consultantId).eq("variant", v);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    setActiveVariants(nextActive as Variant[]);
    toast.success(`Variante ${v} excluída`);
    if (editingVariant === v) onSelectVariant("A");
    await onChanged();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card/50 p-2">
        <div className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
          Distribuição
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                Clientes novos são distribuídos 1 a 1 (round-robin) entre as variantes ativas.
                Variantes pausadas continuam editáveis mas não recebem leads.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {existingVariants.map((v) => {
            const isActive = activeVariants.includes(v);
            const isEditing = editingVariant === v;
            return (
              <div
                key={v}
                className={`group flex items-center gap-1.5 rounded-lg border px-2 py-1 transition ${
                  isEditing ? "border-primary bg-primary/10" : "border-border bg-background"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectVariant(v)}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <span className={`h-2 w-2 rounded-full ${isActive ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                  <span className="font-semibold">{v}</span>
                  <span className="hidden text-muted-foreground sm:inline">
                    {VARIANT_LABEL[v].replace(/^[A-E]\s*/, "")}
                  </span>
                </button>
                {busy === v ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : (
                  <Switch
                    checked={isActive}
                    onCheckedChange={(c) => toggleActive(v, c)}
                    className="scale-75"
                  />
                )}
                {v !== "A" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-5 w-5">
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteVariant(v)}
                      >
                        Excluir variante {v}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}

          {existingVariants.length < ALL_VARIANTS.length && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={addVariant}
              disabled={creating}
            >
              {creating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
              Adicionar variante
            </Button>
          )}
        </div>

        <div className="ml-auto">
          <Badge variant="secondary" className="text-[10px]">
            {activeVariants.length} ativa{activeVariants.length === 1 ? "" : "s"} · round-robin 1 a 1
          </Badge>
        </div>
      </div>
    </div>
  );
}
