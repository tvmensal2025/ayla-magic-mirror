import { CheckCircle2 } from "lucide-react";
import type { GameProgress } from "./useGameProgress";

interface Goal { id: string; label: string; pts: number; current: number; target: number; }

export function QuestsBar({ progress }: { progress: GameProgress }) {
  const { todayCount, streak, weekCount } = progress;
  const goals: Goal[] = [
    { id: "today3",  label: "3 cadastros hoje",    pts: 50,  target: 3,  current: todayCount },
    { id: "streak5", label: "5 dias consecutivos", pts: 100, target: 5,  current: streak },
    { id: "week10",  label: "10 na semana",         pts: 150, target: 10, current: weekCount },
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm p-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Metas do Dia
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {goals.map((g, i) => {
          const pct = Math.min(100, Math.round((g.current / g.target) * 100));
          const done = g.current >= g.target;
          return (
            <div
              key={g.id}
              className={`relative overflow-hidden rounded-lg border p-3 transition-all animate-exec-card ${
                done
                  ? "border-amber-400/40 bg-gradient-to-br from-amber-400/8 to-transparent"
                  : "border-border/60 bg-background/40"
              }`}
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              {/* Gold sweep when done */}
              {done && <div className="absolute inset-0 exec-gold-sweep pointer-events-none" />}

              <div className="relative flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-foreground/80 flex-1 pr-2 leading-tight">
                  {g.label}
                </span>
                {done ? (
                  <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">
                    {Math.min(g.current, g.target)}/{g.target}
                  </span>
                )}
              </div>

              <div className="relative h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full transition-all duration-700 rounded-full ${
                    done
                      ? "bg-gradient-to-r from-amber-500 to-yellow-400 exec-bar-active"
                      : "bg-primary"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <span className={`text-[9px] font-bold mt-1.5 inline-block uppercase tracking-wider ${
                done ? "exec-shimmer" : "text-muted-foreground"
              }`}>
                +{g.pts} pts
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
