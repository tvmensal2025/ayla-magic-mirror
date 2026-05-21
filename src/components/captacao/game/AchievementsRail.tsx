import type { GameProgress } from "./useGameProgress";
import { Trophy, Lock } from "lucide-react";

interface Achievement { id: string; label: string; emoji: string; unlocked: boolean; hint: string; }

export function AchievementsRail({ progress }: { progress: GameProgress }) {
  const { totalXp, level, streak, todayCount, weekCount } = progress;
  const leads = totalXp / 10;
  const list: Achievement[] = [
    { id: "first", label: "Primeiro Cadastro", emoji: "🥇", unlocked: leads >= 1, hint: "Capture o primeiro lead" },
    { id: "five", label: "Cinco em Cinco", emoji: "🖐️", unlocked: leads >= 5, hint: "Chegue a 5 capturas" },
    { id: "marathon", label: "Maratona Diária", emoji: "🏃", unlocked: todayCount >= 5, hint: "5 capturas em um dia" },
    { id: "combo3", label: "Triplo Combo", emoji: "💥", unlocked: todayCount >= 3, hint: "3 capturas seguidas no dia" },
    { id: "streak7", label: "Semana de Fogo", emoji: "🔥", unlocked: streak >= 7, hint: "7 dias seguidos capturando" },
    { id: "weekly10", label: "Top da Semana", emoji: "📈", unlocked: weekCount >= 10, hint: "10 capturas em 7 dias" },
    { id: "level5", label: "Caçador Nato", emoji: "🏹", unlocked: level >= 5, hint: "Alcance o nível 5" },
    { id: "level10", label: "Mestre Captador", emoji: "👑", unlocked: level >= 10, hint: "Alcance o nível 10" },
    { id: "level20", label: "Lenda Viva", emoji: "🐉", unlocked: level >= 20, hint: "Alcance o nível 20" },
  ];

  const unlockedCount = list.filter((a) => a.unlocked).length;

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm p-3 h-full">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-amber-400" />
        <span className="text-xs font-bold uppercase tracking-wider">Conquistas</span>
        <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">{unlockedCount}/{list.length}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {list.map((a) => (
          <div
            key={a.id}
            title={`${a.label} — ${a.hint}`}
            className={`relative aspect-square rounded-lg border flex flex-col items-center justify-center p-1 transition ${
              a.unlocked
                ? "border-amber-400/60 bg-gradient-to-br from-amber-400/25 to-amber-500/5 shadow-[0_0_12px_hsl(45_95%_55%/0.3)]"
                : "border-border bg-secondary/40 opacity-60"
            }`}
          >
            <span className={`text-xl ${a.unlocked ? "" : "grayscale opacity-60"}`}>{a.emoji}</span>
            <span className={`text-[8px] font-semibold text-center leading-tight mt-0.5 ${a.unlocked ? "text-amber-500" : "text-muted-foreground"}`}>
              {a.label}
            </span>
            {!a.unlocked && <Lock className="absolute top-1 right-1 w-2.5 h-2.5 text-muted-foreground" />}
          </div>
        ))}
      </div>
    </div>
  );
}
