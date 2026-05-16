import { useState } from "react";
import { useSuppressedRules } from "@/hooks/useSuppressedRules";
import { Card } from "@/components/ui/card";
import { Loader2, ShieldOff, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const REASON_LABELS: Record<string, string> = {
  capture_priority: "Captura prioritária (lead respondeu o que foi pedido)",
  max_fires: "Limite por conversa atingido",
  rate_limit: "Rate limit (muitas regras em 1 min)",
  cooldown: "Cooldown ativo",
  step_scope_mismatch: "Escopo de passo não confere",
  keyword_too_short: "Keyword com menos de 2 caracteres",
  inactive: "Regra inativa",
  no_match: "Sem match",
};

const REASON_COLOR: Record<string, string> = {
  capture_priority: "bg-emerald-500/70",
  max_fires: "bg-amber-500/70",
  rate_limit: "bg-rose-500/70",
  cooldown: "bg-sky-500/70",
};

export function SuppressedRulesPanel() {
  const [days, setDays] = useState(7);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { data, isLoading } = useSuppressedRules(days);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const max = Math.max(...(data || []).map((s) => s.count), 1);

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-4 py-3 flex items-center gap-2">
        <ShieldOff className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Regras suprimidas</h3>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="ml-auto bg-background border border-border rounded-md text-sm px-2 py-1"
        >
          <option value={1}>Últimas 24h</option>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
        </select>
      </div>

      {!data || data.length === 0 ? (
        <div className="p-8 text-center">
          <ShieldOff className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">
            Nenhuma regra foi suprimida no período.
            <br />
            <span className="text-xs">
              Significa que todas as regras avaliadas dispararam normalmente.
            </span>
          </p>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {data.map((g) => {
            const label = REASON_LABELS[g.reason] || g.reason;
            const widthPct = (g.count / max) * 100;
            const color = REASON_COLOR[g.reason] || "bg-primary/70";
            const isOpen = !!expanded[g.reason];
            return (
              <div key={g.reason} className="space-y-1">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((s) => ({ ...s, [g.reason]: !s[g.reason] }))
                  }
                  className="w-full text-left flex items-baseline justify-between text-sm hover:opacity-90"
                >
                  <span className="font-medium truncate flex items-center gap-1">
                    {isOpen ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    {label}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {g.count.toLocaleString("pt-BR")}
                    {g.last_at && (
                      <span className="text-xs ml-2">
                        · último{" "}
                        {format(new Date(g.last_at), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    )}
                  </span>
                </button>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${color} transition-all`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                {isOpen && g.top_rules.length > 0 && (
                  <ul className="mt-2 ml-4 space-y-1 text-xs text-muted-foreground">
                    {g.top_rules.map((r) => (
                      <li
                        key={r.rule_id}
                        className="flex items-center justify-between border-l border-border pl-2"
                      >
                        <span className="truncate">{r.name}</span>
                        <span className="tabular-nums">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
