import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FLOW_TEMPLATES, FlowTemplate } from "./flowTemplates";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flowId: string | null;
  currentMaxPosition: number;
  onApplied: () => void;
}

export default function FlowTemplatesDialog({ open, onOpenChange, flowId, currentMaxPosition, onApplied }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  async function apply(tpl: FlowTemplate) {
    if (!flowId) return;
    setApplying(true);
    try {
      const rows = tpl.steps.map((s, i) => ({
        flow_id: flowId,
        position: currentMaxPosition + i + 1,
        step_type: s.step_type,
        step_key: s.step_key,
        title: s.title,
        summary: s.summary ?? "",
        icon: s.icon ?? "msg",
        message_text: s.message_text ?? "",
        slot_key: s.slot_key ?? s.step_key,
        transitions: s.transitions ?? [],
        captures: s.captures ?? [],
        fallback: s.fallback ?? { mode: "repeat" },
        is_active: true,
      }));
      const { error } = await supabase.from("bot_flow_steps").insert(rows as any);
      if (error) throw error;
      toast.success(`${tpl.name}: ${rows.length} passos adicionados`);
      onApplied();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Erro ao aplicar template: " + (e?.message || "desconhecido"));
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Templates de fluxo
          </DialogTitle>
          <DialogDescription>
            Comece com um fluxo pronto. Os passos são adicionados ao final do seu fluxo atual — você pode editar e reordenar depois.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[420px] pr-3">
          <div className="grid gap-2">
            {FLOW_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setPicked(tpl.id)}
                className={`group flex items-start gap-3 rounded-lg border p-3 text-left transition-all hover:border-primary/50 ${
                  picked === tpl.id ? "border-primary bg-primary/5 ring-2 ring-primary/20" : ""
                }`}
              >
                <span className="text-2xl">{tpl.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{tpl.name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {tpl.steps.length} passos
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{tpl.description}</p>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancelar
          </Button>
          <Button
            disabled={!picked || applying || !flowId}
            onClick={() => {
              const tpl = FLOW_TEMPLATES.find((t) => t.id === picked);
              if (tpl) apply(tpl);
            }}
          >
            {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Adicionar ao fluxo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
