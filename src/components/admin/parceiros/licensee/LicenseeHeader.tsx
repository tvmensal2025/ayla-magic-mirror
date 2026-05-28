import { Card } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Crown, Sparkles, TrendingUp, Users } from "lucide-react";
import type { LicenseeStats } from "../hooks/useLicenseeStats";

interface Props {
  name: string;
  phone: string;
  igreenId: string;
  slug: string;
  stats: LicenseeStats;
}

export function LicenseeHeader({ stats }: Props) {
  const trendPositive = stats.trend >= 0;

  return (
    <Card className="relative overflow-hidden border-primary/20">
      {/* Gradient background */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent" />
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />

      <div className="relative p-5 sm:p-6">
        {/* Header */}
        <div className="flex items-center gap-2 mb-5">
          <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center ring-1 ring-primary/30">
            <Crown className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-primary/80 font-semibold">
              Painel do Licenciado
            </p>
            <h2 className="text-base sm:text-lg font-heading font-bold tracking-tight leading-tight">
              Sua performance em tempo real
            </h2>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={<Sparkles className="h-4 w-4" />}
            label="Leads (30d)"
            value={stats.leads30d}
            trend={
              <span
                className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
                  trendPositive ? "text-emerald-400" : "text-destructive"
                }`}
              >
                {trendPositive ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                )}
                {Math.abs(stats.trend)}%
              </span>
            }
            accent="from-primary/25 to-primary/5"
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Conversão"
            value={`${stats.conversion}%`}
            accent="from-emerald-500/25 to-emerald-500/5"
          />
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="Parceiros"
            value={stats.activePartners}
            accent="from-amber-500/25 to-amber-500/5"
          />
        </div>
      </div>
    </Card>
  );
}

function StatCard({
  icon,
  label,
  value,
  trend,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm p-3 sm:p-4 transition-all hover:border-primary/40 hover:bg-card/60">
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent} opacity-60 group-hover:opacity-100 transition-opacity`}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <div className="h-7 w-7 rounded-lg bg-background/60 text-foreground/80 flex items-center justify-center ring-1 ring-border/60">
            {icon}
          </div>
          {trend}
        </div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </p>
        <p className="text-xl sm:text-2xl font-bold tabular-nums leading-tight mt-0.5">
          {value}
        </p>
      </div>
    </div>
  );
}
