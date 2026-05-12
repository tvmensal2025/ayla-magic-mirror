import { GripVertical, User, Pencil, Trash2, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { KanbanSlaIndicator } from "./KanbanSlaIndicator";
import type { Tables } from "@/integrations/supabase/types";

type CrmDealRow = Tables<"crm_deals">;

interface KanbanDealCardProps {
  deal: CrmDealRow;
  onDragStart: (id: string) => void;
  onEdit: (deal: CrmDealRow) => void;
  onDelete: (id: string) => void;
}

export function KanbanDealCard({ deal, onDragStart, onEdit, onDelete }: KanbanDealCardProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(deal.id)}
      className="p-3 cursor-grab active:cursor-grabbing rounded-xl bg-card border border-border/50 hover:border-primary/25 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 mt-0.5 shrink-0 group-hover:text-muted-foreground transition-colors" />
        <div className="flex-1 min-w-0">
          {(deal as any).customer_name && (
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className="w-4 h-4 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-2.5 w-2.5 text-primary" />
              </div>
              <span className="text-xs font-medium text-foreground truncate sensitive-data">
                {(deal as any).customer_name}
              </span>
            </div>
          )}
          <span className="text-[10px] text-muted-foreground truncate block sensitive-phone">
            {deal.remote_jid?.split("@")[0] || "Sem contato"}
          </span>
          <div className="mt-1">
            <KanbanSlaIndicator enteredAt={deal.updated_at || deal.created_at} />
          </div>
          {deal.approved_at && (
            <p className="text-[9px] text-emerald-500/80 mt-1">
              ✓ {new Date(deal.approved_at).toLocaleDateString("pt-BR")}
            </p>
          )}
          {deal.rejected_at && (
            <p className="text-[9px] text-red-400/80 mt-1">
              ✗ {new Date(deal.rejected_at).toLocaleDateString("pt-BR")}
              {deal.rejection_reason && ` · ${deal.rejection_reason.replace(/_/g, " ")}`}
            </p>
          )}
          {deal.notes && (
            <p className="text-[10px] text-muted-foreground/70 truncate mt-1 italic">{deal.notes}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-6 w-6 flex items-center justify-center rounded-lg hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); onEdit(deal); }}>
              <Pencil className="h-3 w-3" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(deal.id); }}>
              <Trash2 className="h-3 w-3" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
