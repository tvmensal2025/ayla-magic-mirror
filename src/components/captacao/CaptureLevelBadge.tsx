import type { LevelTier } from "@/hooks/useCaptureGameState";

export function CaptureLevelBadge({ tier, animate }: { tier: LevelTier; animate?: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/80 border border-border ring-2 ${tier.ring} ${animate ? "animate-scale-in" : ""}`}
      title={`Nível: ${tier.name}`}
    >
      <span className="text-base leading-none">{tier.emoji}</span>
      <span className={`text-[11px] font-bold uppercase tracking-wider ${tier.color}`}>{tier.name}</span>
    </div>
  );
}
