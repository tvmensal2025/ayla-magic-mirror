import { Badge } from "@/components/ui/badge";
import { Crown, Flame, Sparkles, Target, Zap } from "lucide-react";
import type { RankingBadgeFlags } from "./useRankingRows";

interface Props {
  flags: RankingBadgeFlags;
  streak?: number;
  size?: "sm" | "md";
}

const ICON_CLASS = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
} as const;

export function RankingBadges({ flags, streak = 0, size = "sm" }: Props) {
  const icon = ICON_CLASS[size];
  const badges: { key: string; node: React.ReactNode }[] = [];

  if (flags.champion)
    badges.push({
      key: "champion",
      node: (
        <Badge className="gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20">
          <Crown className={icon} /> Campeão
        </Badge>
      ),
    });
  if (flags.hot)
    badges.push({
      key: "hot",
      node: (
        <Badge className="gap-1 bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20">
          <Flame className={icon} /> Em alta
        </Badge>
      ),
    });
  if (flags.rookie)
    badges.push({
      key: "rookie",
      node: (
        <Badge className="gap-1 bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30 hover:bg-sky-500/20">
          <Sparkles className={icon} /> Novato
        </Badge>
      ),
    });
  if (flags.highConv)
    badges.push({
      key: "conv",
      node: (
        <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
          <Target className={icon} /> Conv. alta
        </Badge>
      ),
    });
  if (flags.streak)
    badges.push({
      key: "streak",
      node: (
        <Badge className="gap-1 bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30 hover:bg-violet-500/20">
          <Zap className={icon} /> {streak}d
        </Badge>
      ),
    });

  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span key={b.key}>{b.node}</span>
      ))}
    </div>
  );
}
