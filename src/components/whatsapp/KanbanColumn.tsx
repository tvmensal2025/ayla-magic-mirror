import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Zap } from "lucide-react";
import { KanbanDealCard } from "./KanbanDealCard";
import type { Tables } from "@/integrations/supabase/types";

type KanbanStageRow = Tables<"kanban_stages">;
type CrmDealRow = Tables<"crm_deals">;

interface KanbanColumnProps {
  stage: KanbanStageRow;
  deals: CrmDealRow[];
  searchQuery: string;
  onDrop: (stageKey: string) => void;
  onDragStart: (id: string) => void;
  onEditDeal: (deal: CrmDealRow) => void;
  onDeleteDeal: (id: string) => void;
}

export function KanbanColumn({ stage, deals, searchQuery, onDrop, onDragStart, onEditDeal, onDeleteDeal }: KanbanColumnProps) {
  const allStageDeals = deals.filter((d) => d.stage === stage.stage_key);
  const stageDeals = searchQuery.trim()
    ? allStageDeals.filter((d) => {
        const q = searchQuery.toLowerCase();
        const phone = d.remote_jid?.split("@")[0] || "";
        const notes = d.notes || "";
        const name = ((d as any).customer_name || "").toLowerCase();
        return phone.includes(q) || notes.toLowerCase().includes(q) || name.includes(q);
      })
    : allStageDeals;

  return (
    <div
      className="min-w-[220px] flex-1 bg-muted/30 rounded-2xl border border-border/40 backdrop-blur-sm overflow-hidden transition-colors hover:border-border/60"
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary/30", "bg-primary/[0.03]"); }}
      onDragLeave={(e) => { e.currentTarget.classList.remove("border-primary/30", "bg-primary/[0.03]"); }}
      onDrop={(e) => { e.currentTarget.classList.remove("border-primary/30", "bg-primary/[0.03]"); onDrop(stage.stage_key); }}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={`text-[10px] font-medium ${stage.color} border-0`}>
            {stage.label}
          </Badge>
          {stage.auto_message_enabled && stage.auto_message_text && (
            <Zap className="h-3 w-3 text-primary/60" />
          )}
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
          {stageDeals.length}
        </span>
      </div>

      {/* Cards */}
      <ScrollArea className="max-h-[420px]">
        <div className="p-2 space-y-1.5">
          {stageDeals.map((deal) => (
            <KanbanDealCard
              key={deal.id}
              deal={deal}
              onDragStart={onDragStart}
              onEdit={onEditDeal}
              onDelete={onDeleteDeal}
            />
          ))}
          {stageDeals.length === 0 && (
            <div className="text-center py-8">
              <p className="text-[11px] text-muted-foreground/60">Vazio</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
