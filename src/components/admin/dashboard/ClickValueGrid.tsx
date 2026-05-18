import { MousePointerClick, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { friendlyClickLabel } from "@/hooks/useAnalytics";
import { Sparkline } from "./Sparkline";

interface TargetData {
  total: number;
  spark: number[];
  current: number;
  previous: number;
  change: number;
}

interface Props {
  data?: Record<string, TargetData>;
}

function ChangeChip({ value }: { value: number }) {
  const flat = Math.abs(value) < 1;
  const up = value >= 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const color = flat
    ? "text-muted-foreground"
    : up
    ? "text-primary"
    : "text-destructive";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${color}`}>
      <Icon className="w-3 h-3" />
      {flat ? "estável" : `${Math.abs(value).toFixed(0)}%`}
    </span>
  );
}

// Distinct accent per CTA family for the sparkline
function colorFor(target: string): string {
  if (target.includes("whatsapp")) return "hsl(142, 76%, 45%)";
  if (target.includes("cadastro")) return "hsl(30, 100%, 55%)";
  if (target.includes("licenciada")) return "hsl(280, 80%, 65%)";
  if (target.includes("telefone")) return "hsl(200, 100%, 55%)";
  if (target.includes("instagram")) return "hsl(330, 80%, 60%)";
  if (target.includes("facebook")) return "hsl(220, 90%, 60%)";
  return "hsl(var(--primary))";
}

export function ClickValueGrid({ data }: Props) {
  const entries = Object.entries(data || {})
    .filter(([, v]) => v.total > 0)
    .sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="premium-card">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-heading font-bold text-foreground text-base flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <MousePointerClick className="w-4 h-4" />
          </div>
          Valor de cada clique
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Detalhamento de cada CTA da sua landing page no período</p>

      {entries.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          Nenhum clique registrado ainda no período selecionado.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {entries.map(([target, d]) => {
            const accent = colorFor(target);
            return (
              <div
                key={target}
                className="relative bg-secondary/40 dark:bg-secondary/50 border border-border/40 rounded-xl p-4 hover:border-primary/40 hover:bg-secondary/60 transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-sm font-semibold text-foreground truncate pr-2">
                    {friendlyClickLabel(target)}
                  </span>
                  <ChangeChip value={d.change} />
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-2xl font-bold font-heading text-foreground leading-none">{d.total}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      7d: {d.current} · anterior: {d.previous}
                    </p>
                  </div>
                  <Sparkline data={d.spark} color={accent} width={80} height={28} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
