import { Eye, MousePointerClick, Users, CheckCircle2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Sparkline } from "./Sparkline";

interface KpiData {
  current: number;
  previous: number;
  change: number;
  spark: number[];
}

interface Props {
  kpis?: {
    views: KpiData;
    clicks: KpiData;
    leads: KpiData;
    approved: KpiData;
  };
}

function ChangeBadge({ value }: { value: number }) {
  const flat = Math.abs(value) < 1;
  const up = value >= 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const color = flat
    ? "text-muted-foreground bg-muted/40"
    : up
    ? "text-primary bg-primary/15"
    : "text-destructive bg-destructive/15";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>
      <Icon className="w-3 h-3" />
      {flat ? "0%" : `${Math.abs(value).toFixed(0)}%`}
    </span>
  );
}

const ITEMS = [
  { key: "views", label: "Visitas", icon: Eye, color: "hsl(130, 100%, 45%)" },
  { key: "clicks", label: "Cliques", icon: MousePointerClick, color: "hsl(30, 100%, 55%)" },
  { key: "leads", label: "Novos Leads", icon: Users, color: "hsl(200, 100%, 55%)" },
  { key: "approved", label: "Aprovados", icon: CheckCircle2, color: "hsl(160, 80%, 50%)" },
] as const;

export function HeroKpis({ kpis }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-5 sm:p-6">
      {/* Decorative glow */}
      <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
      <div className="relative">
        <div className="mb-4">
          <h2 className="font-heading font-bold text-lg text-foreground">Painel de Performance</h2>
          <p className="text-xs text-muted-foreground">Resumo dos últimos 7 dias vs. os 7 anteriores</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {ITEMS.map(({ key, label, icon: Icon, color }) => {
            const data = kpis?.[key];
            return (
              <div
                key={key}
                className="group relative bg-card/60 backdrop-blur border border-border/40 rounded-xl p-4 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Icon className="w-4 h-4" />
                  </div>
                  {data && <ChangeBadge value={data.change} />}
                </div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{label}</p>
                <p className="text-2xl sm:text-3xl font-bold font-heading text-foreground leading-none">
                  {data?.current ?? 0}
                </p>
                <div className="flex items-end justify-between mt-3">
                  <span className="text-[10px] text-muted-foreground">Antes: {data?.previous ?? 0}</span>
                  {data && <Sparkline data={data.spark} color={color} width={70} height={22} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
