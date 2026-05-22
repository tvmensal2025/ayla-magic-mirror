import { Zap } from "lucide-react";

export function CaptureComboIndicator({ combo }: { combo: number }) {
  if (combo <= 0) return null;
  const mult = combo + 1;
  return (
    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/15 border border-primary/30 text-primary text-xs font-bold animate-exec-energy shadow-[0_0_12px_hsl(var(--primary)/0.2)]">
      <Zap className="w-3 h-3" strokeWidth={2} />
      Sequência ×{mult}
    </div>
  );
}
