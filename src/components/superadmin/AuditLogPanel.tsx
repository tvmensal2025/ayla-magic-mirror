import { useAdminAudit } from "@/hooks/useAdminAudit";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Shield, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ACTION_LABELS: Record<string, string> = {
  approve_consultant: "Aprovou consultor",
  reject_consultant: "Rejeitou consultor",
  reset_password: "Resetou senha",
  update_credentials: "Atualizou credenciais",
  delete_consultant: "Removeu consultor",
};

export function AuditLogPanel() {
  const { data: entries, isLoading } = useAdminAudit(200);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Shield className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">
          Nenhuma ação administrativa registrada ainda.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Log de Auditoria</h3>
          <Badge variant="secondary" className="ml-auto">
            {entries.length} registros
          </Badge>
        </div>
      </div>
      <ScrollArea className="h-[500px]">
        <div className="divide-y divide-border">
          {entries.map((entry) => {
            const label = ACTION_LABELS[entry.action] || entry.action;
            return (
              <div key={entry.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{label}</p>
                    {entry.target_type && entry.target_id && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {entry.target_type}:{" "}
                        <code className="text-xs">{entry.target_id.slice(0, 8)}…</code>
                      </p>
                    )}
                    {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                      <details className="mt-1">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          detalhes
                        </summary>
                        <pre className="text-xs mt-1 p-2 bg-muted/50 rounded overflow-x-auto">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                    <Clock className="h-3 w-3" />
                    {format(new Date(entry.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}
