import { Flame } from "lucide-react";

export function CaptureComboIndicator({ combo }: { combo: number }) {
  if (combo <= 0) return null;
  const mult = combo + 1;
  return (
    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-fuchsia-600 to-orange-500 text-white text-xs font-black shadow-lg animate-combo-pop">
      <Flame className="w-3.5 h-3.5" /> COMBO x{mult}
    </div>
  );
}
