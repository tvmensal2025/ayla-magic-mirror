// Combo timer banner — shown when the consultor has an active combo running.
// Displays:
//   - Combo level (x1, x2, x3...)
//   - Countdown bar (filling DOWN from 100% to 0%)
//   - Bonus XP available
//
// Compact (mobile) and expanded (desktop) variants.

import { Flame, Zap, Clock } from "lucide-react";

interface Props {
  level: number;
  secondsLeft: number;
  progressPct: number;
  bonusXp: number;
  compact?: boolean;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function ComboTimer({ level, secondsLeft, progressPct, bonusXp, compact }: Props) {
  if (level < 1) return null;

  // Estilo dinâmico baseado no nível do combo.
  const tier = level >= 4 ? "diamond" : level >= 3 ? "fire" : level >= 2 ? "amber" : "primary";
  const ringClass = {
    primary: "border-primary/40 from-primary/15 to-primary/5",
    amber: "border-amber-400/60 from-amber-400/20 to-amber-500/5",
    fire: "border-orange-500/70 from-orange-500/25 to-rose-500/10 animate-game-bounce",
    diamond: "border-fuchsia-500/70 from-fuchsia-500/25 via-violet-500/15 to-cyan-500/10 animate-game-bounce",
  }[tier];

  const flameClass = {
    primary: "text-primary",
    amber: "text-amber-400",
    fire: "text-orange-500",
    diamond: "text-fuchsia-400",
  }[tier];

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border bg-gradient-to-r ${ringClass}`}>
        <Flame className={`w-3 h-3 ${flameClass}`} />
        <span className="text-[10px] font-black tabular-nums">x{level + 1}</span>
        <span className="text-[9px] tabular-nums text-muted-foreground">{formatTime(secondsLeft)}</span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${ringClass} p-2.5`}>
      <div className="flex items-center gap-2">
        <Flame className={`w-5 h-5 ${flameClass} drop-shadow-[0_0_8px_currentColor]`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-black tabular-nums">COMBO x{level + 1}</span>
            {bonusXp > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-400">
                <Zap className="w-3 h-3" /> +{bonusXp} XP no próximo
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
            <Clock className="w-3 h-3" />
            <span>{formatTime(secondsLeft)} restantes</span>
          </div>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full transition-[width] duration-1000 ease-linear ${
            tier === "diamond" ? "bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400" :
            tier === "fire" ? "bg-gradient-to-r from-orange-500 to-rose-500" :
            tier === "amber" ? "bg-gradient-to-r from-amber-400 to-amber-500" :
            "bg-primary"
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}
