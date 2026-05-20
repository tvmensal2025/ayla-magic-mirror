import type { LevelTier } from "@/hooks/useCaptureGameState";

interface Props { progress: number; filled: number; total: number; tier?: LevelTier; }

const TIER_GRADIENT: Record<number, string> = {
  0: "from-slate-500 via-slate-400 to-slate-300",
  1: "from-orange-700 via-orange-500 to-amber-400",
  2: "from-zinc-400 via-zinc-300 to-white",
  3: "from-amber-600 via-amber-400 to-yellow-300",
  4: "from-cyan-500 via-cyan-300 to-emerald-300",
  5: "from-emerald-500 via-green-400 to-lime-300",
};

export function CaptureProgressBar({ progress, filled, total, tier }: Props) {
  const grad = TIER_GRADIENT[tier?.index ?? 0] || TIER_GRADIENT[0];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-muted-foreground tracking-wide uppercase">XP do Lead</span>
        <span className="font-bold text-primary tabular-nums">{filled}/{total}</span>
      </div>
      <div className="relative h-3 rounded-full bg-secondary overflow-hidden border border-border">
        <div
          className={`absolute inset-y-0 left-0 bg-gradient-to-r ${grad} transition-all duration-500 ease-out`}
          style={{ width: `${progress}%` }}
        />
        {/* shimmer overlay */}
        <div
          className="absolute inset-y-0 left-0 opacity-60 mix-blend-overlay transition-all duration-500"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
            backgroundSize: "200% 100%",
            animation: progress > 0 ? "shimmer-gold 2.4s linear infinite" : "none",
          }}
        />
        {progress === 100 && (
          <div className="absolute inset-0 animate-pulse bg-white/20 mix-blend-overlay" />
        )}
      </div>
    </div>
  );
}
