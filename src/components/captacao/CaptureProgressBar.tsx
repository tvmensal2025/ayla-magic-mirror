import type { LevelTier } from "@/hooks/useCaptureGameState";

interface Props { progress: number; filled: number; total: number; tier?: LevelTier; }

const TIER_GRADIENT: Record<number, string> = {
  0: "from-slate-500 to-slate-400",
  1: "from-amber-700 to-amber-500",
  2: "from-zinc-400 to-zinc-200",
  3: "from-amber-500 to-yellow-400",
  4: "from-cyan-500 to-cyan-300",
  5: "from-emerald-500 to-green-400",
};

export function CaptureProgressBar({ progress, filled, total, tier }: Props) {
  const grad = TIER_GRADIENT[tier?.index ?? 0] || TIER_GRADIENT[0];
  const isActive = progress > 0 && progress < 100;
  const isComplete = progress >= 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground tracking-wide uppercase text-[10px]">
          Progresso do Cadastro
        </span>
        <span className={`font-bold tabular-nums text-[10px] ${isComplete ? "text-primary" : "text-foreground"}`}>
          {filled}/{total}
        </span>
      </div>

      <div className="relative h-2.5 rounded-full bg-secondary overflow-hidden border border-border/40">
        <div
          className={`absolute inset-y-0 left-0 bg-gradient-to-r ${grad} transition-all duration-500 ease-out rounded-full ${isActive ? "exec-bar-active" : ""}`}
          style={{ width: `${progress}%` }}
        />
        {/* Shimmer overlay when complete */}
        {isComplete && (
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)",
              backgroundSize: "200% 100%",
              animation: "exec-shimmer 2s linear infinite",
            }}
          />
        )}
      </div>
    </div>
  );
}
