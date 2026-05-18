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

function Delta({ value }: { value: number }) {
  const flat = Math.abs(value) < 1;
  const up = value >= 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const cls = flat ? "text-muted-foreground" : up ? "text-primary" : "text-destructive";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold tracking-wider ${cls}`}>
      <Icon className="w-3 h-3" />
      {flat ? "0%" : `${Math.abs(value).toFixed(0)}%`}
    </span>
  );
}

function colorFor(target: string): string {
  if (target.includes("whatsapp")) return "hsl(142 76% 48%)";
  if (target.includes("cadastro")) return "hsl(38 92% 55%)";
  if (target.includes("licenciada")) return "hsl(280 80% 65%)";
  if (target.includes("telefone")) return "hsl(200 100% 55%)";
  if (target.includes("instagram")) return "hsl(330 80% 60%)";
  if (target.includes("facebook")) return "hsl(220 90% 60%)";
  return "hsl(var(--primary))";
}

export function ClickValueGrid({ data }: Props) {
  const entries = Object.entries(data || {})
    .filter(([, v]) => v.total > 0)
    .sort((a, b) => b[1].total - a[1].total);
  const top = entries[0]?.[1].total ?? 0;

  return (
    <section className="rounded-2xl border border-border/60 bg-[hsl(0_0%_4%)] dark:bg-[hsl(0_0%_4%)] overflow-hidden">
      <header className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border/40">
        <div className="flex items-center gap-3">
          <MousePointerClick className="w-4 h-4 text-primary" />
          <div>
            <h3 className="font-heading font-black text-foreground text-sm tracking-tight">VALOR DE CADA CLIQUE</h3>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Ranking dos CTAs no período</p>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground hidden sm:inline">
          {entries.length} CTAs ativos
        </span>
      </header>

      {entries.length === 0 ? (
        <div className="text-center py-14 text-sm text-muted-foreground">
          Nenhum clique registrado no período.
        </div>
      ) : (
        <ol className="divide-y divide-border/40">
          {entries.map(([target, d], i) => {
            const accent = colorFor(target);
            const widthPct = top > 0 ? (d.total / top) * 100 : 0;
            const isTop = i === 0;
            return (
              <li
                key={target}
                className={`relative grid grid-cols-[auto_1fr_auto_auto] sm:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-5 sm:px-6 py-4 transition-colors hover:bg-[hsl(0_0%_7%)] ${isTop ? "bg-[hsl(0_0%_6%)]" : ""}`}
              >
                {isTop && <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: accent }} />}

                <span
                  className={`font-heading font-black text-2xl tabular-nums leading-none w-8 ${isTop ? "text-foreground" : "text-muted-foreground/50"}`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{friendlyClickLabel(target)}</p>
                  <div className="mt-2 h-[3px] w-full bg-border/30 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-700"
                      style={{ width: `${widthPct}%`, background: accent }}
                    />
                  </div>
                </div>

                <div className="hidden sm:flex flex-col items-end">
                  <Sparkline data={d.spark} color={accent} width={84} height={26} variant="line" />
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">7d</span>
                </div>

                <Delta value={d.change} />

                <span className="font-heading font-black text-2xl sm:text-3xl tabular-nums text-foreground leading-none min-w-[3ch] text-right">
                  {d.total}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
