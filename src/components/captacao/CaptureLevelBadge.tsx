import type { LevelTier } from "@/hooks/useCaptureGameState";

export function CaptureLevelBadge({ tier, animate }: { tier: LevelTier; animate?: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border/60 ring-1 ${tier.ring} ${animate ? "animate-scale-in" : ""}`}
      title={`Nível: ${tier.name}`}
    >
      <span className={`text-[10px] font-black uppercase tracking-widest ${tier.color}`}>
        {tier.name}
      </span>
    </div>
  );
}
