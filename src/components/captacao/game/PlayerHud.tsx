import { Sparkles, Flame, Zap } from "lucide-react";
import type { GameProgress } from "./useGameProgress";

export function PlayerHud({ progress }: { progress: GameProgress }) {
  const { level, rank, xpInLevel, xpToNext, progressPct, streak, todayCount } = progress;
  return (
    <div className="relative rounded-2xl border border-primary/30 bg-card/70 backdrop-blur-md p-3 shadow-[0_0_30px_hsl(var(--primary)/0.15)] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-amber-500/10 pointer-events-none" />
      <div className="relative flex items-center gap-3 flex-wrap">
        {/* Avatar / Rank emblem */}
        <div className="relative shrink-0">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center text-2xl shadow-[0_0_24px_hsl(var(--primary)/0.5)] animate-game-glow">
            {rank.emoji}
          </div>
          <span className="absolute -bottom-1 -right-1 bg-amber-400 text-amber-950 text-[10px] font-black rounded-full w-6 h-6 flex items-center justify-center shadow-md border-2 border-card">
            {level}
          </span>
        </div>

        {/* Rank + XP bar */}
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-sm font-black uppercase tracking-wide ${rank.color}`}>{rank.label}</span>
            <span className="text-[10px] font-mono text-muted-foreground">NÍVEL {level}</span>
            <span className="text-[10px] font-mono tabular-nums text-muted-foreground ml-auto">{xpInLevel}/{xpToNext} XP</span>
          </div>
          <div className="relative h-3 rounded-full bg-secondary overflow-hidden border border-border/60">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-emerald-400 to-amber-400 transition-all duration-700 ease-out"
              style={{ width: `${progressPct}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 game-xp-shimmer"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Stats chips */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-primary">
            <Zap className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold tabular-nums">{todayCount}</span>
            <span className="text-[9px] uppercase opacity-70">hoje</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-500">
            <Flame className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold tabular-nums">{streak}</span>
            <span className="text-[9px] uppercase opacity-70">streak</span>
          </div>
          {todayCount >= 2 && (
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-amber-400/15 border border-amber-400/40 text-amber-500 animate-game-bounce">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold">COMBO x{todayCount}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
