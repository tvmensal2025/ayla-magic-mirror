import { Flame, Calendar, Trophy } from "lucide-react";

interface Props { today: number; week: number; streak: number; }

export function CaptureScoreboard({ today, week, streak }: Props) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/30">
        <Calendar className="w-3.5 h-3.5 text-primary" />
        <span className="text-muted-foreground">Hoje</span>
        <span className="font-bold text-primary tabular-nums">{today}</span>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary border border-border">
        <Trophy className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-muted-foreground">Semana</span>
        <span className="font-bold tabular-nums">{week}</span>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary border border-border">
        <Flame className={`w-3.5 h-3.5 ${streak > 0 ? "text-orange-500" : "text-muted-foreground"}`} />
        <span className="text-muted-foreground">Streak</span>
        <span className="font-bold tabular-nums">{streak}d</span>
      </div>
    </div>
  );
}
