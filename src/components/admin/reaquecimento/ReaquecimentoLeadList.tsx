import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, Send, ChevronDown, ChevronUp } from "lucide-react";
import { ReaquecimentoLeadHistory } from "./ReaquecimentoLeadHistory";

interface StuckLead {
  id: string;
  name: string | null;
  phone_whatsapp: string;
  conversation_step: string;
  flow_variant: string | null;
  updated_at: string;
  hours_stuck: number;
  total_count: number;
}

interface Props {
  consultantId: string;
  stepFilter: string | null;
  selectedIds: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  onSendSingle: (customerId: string) => void;
}

const PAGE_SIZE = 50;

/** Mascara telefone: (11) 9****-1234 */
function maskPhone(raw: string | null | undefined): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 10) return raw || "—";
  // Remove DDI 55 se presente
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length < 10) return raw || "—";
  const ddd = local.slice(0, 2);
  const last4 = local.slice(-4);
  const middleLen = local.length - 6;
  const stars = "*".repeat(Math.max(1, middleLen));
  return `(${ddd}) ${local.length === 11 ? "9" : ""}${stars}-${last4}`;
}

function formatHoursStuck(hours: number): string {
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours % 24);
  return `${days}d ${rem}h`;
}

export function ReaquecimentoLeadList({
  consultantId, stepFilter, selectedIds, onSelectionChange, onSendSingle,
}: Props) {
  const [leads, setLeads] = useState<StuckLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setPage(0);
    loadLeads(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepFilter]);

  async function loadLeads(p: number) {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("list_stuck_leads", {
      p_consultant: consultantId,
      p_step: stepFilter,
      p_limit: PAGE_SIZE,
      p_offset: p * PAGE_SIZE,
    });
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    const rows = (data as unknown as StuckLead[]) || [];
    setLeads(rows);
    setTotalCount(rows[0]?.total_count != null ? Number(rows[0].total_count) : 0);
    setLoading(false);
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  }

  function selectAllVisible() {
    const next = new Set(selectedIds);
    leads.forEach((l) => next.add(l.id));
    onSelectionChange(next);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-2">
      {leads.length > 0 && (
        <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
          <Checkbox
            checked={leads.every((l) => selectedIds.has(l.id))}
            onCheckedChange={selectAllVisible}
          />
          Selecionar todos da página
          <span className="ml-auto">
            Página {page + 1} de {Math.max(1, totalPages)} · {totalCount} leads
          </span>
        </div>
      )}

      {loading && (
        <Card className="grid place-items-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </Card>
      )}

      {!loading && leads.map((lead) => {
        const isExpanded = expandedId === lead.id;
        const checked = selectedIds.has(lead.id);
        return (
          <Card key={lead.id} className="overflow-hidden">
            <div className="flex items-start gap-3 p-3">
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggleSelect(lead.id)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="truncate text-sm font-semibold">{lead.name || "Sem nome"}</h4>
                  <Badge variant="outline" className="text-[10px]">
                    {lead.flow_variant || "A"}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    parado {formatHoursStuck(Number(lead.hours_stuck))}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isExpanded ? lead.phone_whatsapp : maskPhone(lead.phone_whatsapp)} · passo: {lead.conversation_step}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                  title={isExpanded ? "Esconder histórico" : "Ver histórico"}
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                </Button>
                <Button size="sm" onClick={() => onSendSingle(lead.id)}>
                  <Send className="mr-1 h-3 w-3" />
                  Reaquecer
                </Button>
              </div>
            </div>
            {isExpanded && (
              <div className="border-t bg-muted/30 p-3">
                <ReaquecimentoLeadHistory customerId={lead.id} />
              </div>
            )}
          </Card>
        );
      })}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => { const p = page - 1; setPage(p); loadLeads(p); }}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => { const p = page + 1; setPage(p); loadLeads(p); }}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
