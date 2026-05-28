import { Card } from "@/components/ui/card";
import { Crown, Medal, Trophy, ArrowUp, ArrowDown } from "lucide-react";
import type { RankingRow } from "./useRankingRows";
import { RankingBadges } from "./RankingBadges";

interface Props {
  rows: RankingRow[];
}

const TIER = [
  {
    label: "1º",
    Icon: Crown,
    ring: "ring-amber-500/40",
    bg: "from-amber-500/15 via-amber-500/5 to-transparent",
    text: "text-amber-500",
    glow: "shadow-[0_0_40px_-12px_hsl(var(--primary)/0.4)]",
  },
  {
    label: "2º",
    Icon: Trophy,
    ring: "ring-slate-400/40",
    bg: "from-slate-400/15 via-slate-400/5 to-transparent",
    text: "text-slate-400",
    glow: "",
  },
  {
    label: "3º",
    Icon: Medal,
    ring: "ring-orange-600/40",
    bg: "from-orange-600/15 via-orange-600/5 to-transparent",
    text: "text-orange-500",
    glow: "",
  },
] as const;

export function PodiumTop3({ rows }: Props) {
  const top3 = rows.slice(0, 3);
  if (top3.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {top3.map((row, i) => {
        const tier = TIER[i];
        const trendPositive = row.trend >= 0;
        const initials = row.partner.nome
          .split(" ")
          .map((w) => w[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();
        return (
          <Card
            key={row.partner.id}
            className={`relative overflow-hidden p-4 ring-1 ${tier.ring} ${tier.glow}`}
          >
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tier.bg}`}
            />
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-bold ${tier.text}`}
                >
                  <tier.Icon className="h-4 w-4" /> {tier.label} lugar
                </span>
                {row.last30 > 0 && row.prev30 > 0 && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
                      trendPositive ? "text-emerald-500" : "text-destructive"
                    }`}
                  >
                    {trendPositive ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )}
                    {Math.abs(row.trend)}%
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div
                  className={`h-11 w-11 rounded-xl bg-background/60 backdrop-blur flex items-center justify-center text-sm font-bold ring-1 ${tier.ring}`}
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold leading-tight truncate">
                    {row.partner.nome}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {row.partner.cli}
                  </p>
                </div>
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Leads no mês
                  </p>
                  <p className="text-2xl font-bold tabular-nums">
                    {row.last30}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Conv.
                  </p>
                  <p className="text-lg font-semibold tabular-nums">
                    {row.conv}%
                  </p>
                </div>
              </div>

              <RankingBadges flags={row.badges} streak={row.streak} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
