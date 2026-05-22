import { useEffect } from "react";

interface Props { amount: number; onDone: () => void; }

export function XpToast({ amount, onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[90] pointer-events-none">
      <div className="px-5 py-2.5 rounded-xl bg-card border border-primary/30 text-primary font-black text-base shadow-[0_0_24px_hsl(var(--primary)/0.3)] animate-exec-reveal tabular-nums">
        +{amount} pts
      </div>
    </div>
  );
}
