import { TrendingUp, Calendar, BarChart2 } from "lucide-react";
import type { GameProgress } from "./useGameProgress";

export function PlayerHud({ progress }: { progress: GameProgress }) {
  const { level, rank, xpInLevel, xpToNext, progressPct, streak, todayCount } = progress;
  const isOnFire = streak >= 3;

  return (
    <div className="relative rounded-2xl border border-border/60 bg-card/80 backdrop-blur-md p-4 overflow-hidden exec-ambient animate-exec-card">
      {/* Subtle top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />

      <div className="relative flex items-center gap-4 flex-wrap">
        {/* Rank emblem */}
        <div className="relative shrink-0">
          <div className={`w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shadow-sm ${isOnFire ? "animate-exec-rank" : ""}`}>
            <TrendingUp className="w-6 h-6 text-primary" strokeWidth={1.5} />
          </div>
          {/* Level badge */}
          <span className="absolute -bottom-1 -right-1 bg-amber-400 text-amber-950 text-[10px] font-black rounded-md w-6 h-5 flex items-center justify-center shadow border border-card tabular-nums">
            {level}
          </span>
        </div>

        {/* Rank + progress */}
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-sm font-black uppercase tracking-wide ${rank.color}`}>
              {rank.label}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">· Nível {level}</span>
            <span className="text-[10px] font-mono tabular-nums text-muted-foreground ml-auto">
              {xpInLevel}/{xpToNext} pts
            </span>
          </div>

          {/* Progress bar with executive glow */}
          <div className="relative h-2 rounded-full bg-secondary overflow-hidden border border-border/40">
            <div
              className={`absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-emerald-400 transition-all duration-700 ease-out rounded-full ${progressPct > 0 ? "exec-bar-active" : ""}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <p className="text-[9px] text-muted-foreground mt-1 uppercase tracking-wider">
            Pontos de Performance
          </p>
        </div>

        {/* Metric chips */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary animate-exec-card" style={{ animationDelay: "0.1s" }}>
            <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="text-[11px] font-bold tabular-nums">{todayCount}</span>
            <span className="text-[9px] uppercase opacity-60">hoje</span>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-amber-500 animate-exec-card ${isOnFire ? "bg-amber-400/15 border-amber-400/30 animate-exec-energy" : "bg-secondary border-border/40"}`} style={{ animationDelay: "0.2s" }}>
            <BarChart2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="text-[11px] font-bold tabular-nums">{streak}</span>
            <span className="text-[9px] uppercase opacity-60">dias</span>
          </div>
        </div>
      </div>
    </div>
  );
}
