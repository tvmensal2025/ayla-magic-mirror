import { useEffect } from "react";
import { Trophy } from "lucide-react";

interface Props { level: number; rankLabel: string; onClose: () => void; }

export function LevelUpOverlay({ level, rankLabel, onClose }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="relative">
        {/* Confetti emojis */}
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="absolute text-2xl pointer-events-none game-confetti"
            style={{
              left: `${(i * 53) % 100}%`,
              top: `${(i * 37) % 100}%`,
              animationDelay: `${(i % 6) * 0.08}s`,
            }}
          >
            {["🎉", "✨", "⭐", "🏆", "💚", "🟡"][i % 6]}
          </span>
        ))}
        <div className="relative rounded-3xl border-2 border-amber-400 bg-gradient-to-br from-amber-500/30 via-primary/20 to-emerald-600/30 px-10 py-8 text-center shadow-[0_0_80px_hsl(45_95%_55%/0.6)] animate-game-pop">
          <Trophy className="w-16 h-16 text-amber-400 mx-auto mb-3 animate-game-bounce" />
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-300">Level Up!</p>
          <p className="text-5xl font-black text-foreground my-2">Nível {level}</p>
          <p className="text-base font-bold text-primary uppercase tracking-wide">{rankLabel}</p>
          <p className="text-xs text-muted-foreground mt-3">Continue capturando para subir mais 🚀</p>
        </div>
      </div>
    </div>
  );
}
