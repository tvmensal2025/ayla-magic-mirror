import { useEffect } from "react";

interface Props { amount: number; onDone: () => void; }

export function XpToast({ amount, onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[90] pointer-events-none">
      <div className="px-5 py-2.5 rounded-full bg-gradient-to-r from-primary to-emerald-500 text-primary-foreground font-black text-lg shadow-[0_0_30px_hsl(var(--primary)/0.6)] animate-game-rise">
        +{amount} XP ✨
      </div>
    </div>
  );
}
