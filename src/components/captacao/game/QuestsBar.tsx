import { Target, Award } from "lucide-react";
import type { GameProgress } from "./useGameProgress";

interface Quest { id: string; label: string; emoji: string; xp: number; current: number; target: number; }

export function QuestsBar({ progress }: { progress: GameProgress }) {
  const { todayCount, streak, weekCount } = progress;
  const quests: Quest[] = [
    { id: "today3", label: "Capturar 3 hoje", emoji: "🎯", xp: 50, target: 3, current: todayCount },
    { id: "streak5", label: "Streak 5 dias", emoji: "🔥", xp: 100, target: 5, current: streak },
    { id: "week10", label: "10 na semana", emoji: "📅", xp: 150, target: 10, current: weekCount },
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm p-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Target className="w-3.5 h-3.5 text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Quests do dia</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {quests.map((q) => {
          const pct = Math.min(100, Math.round((q.current / q.target) * 100));
          const done = q.current >= q.target;
          return (
            <div
              key={q.id}
              className={`relative overflow-hidden rounded-lg border p-2 transition ${
                done ? "border-amber-400/60 bg-gradient-to-br from-amber-400/20 to-amber-500/5" : "border-border bg-background/40"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{q.emoji}</span>
                <span className="text-[11px] font-semibold flex-1 truncate">{q.label}</span>
                {done ? (
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <span className="text-[9px] font-mono text-muted-foreground tabular-nums">{Math.min(q.current, q.target)}/{q.target}</span>
                )}
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full ${done ? "bg-amber-400" : "bg-primary"} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-[9px] font-bold mt-1 inline-block ${done ? "text-amber-500" : "text-primary"}`}>+{q.xp} XP</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
