import type { XpEvent } from "@/hooks/useCaptureGameState";

interface Props { events: XpEvent[]; }

export function XpFloater({ events }: Props) {
  return (
    <div className="pointer-events-none fixed top-1/2 right-8 z-[60] flex flex-col items-end gap-1">
      {events.map((e) => (
        <div
          key={e.id}
          className={`px-3 py-1.5 rounded-full font-bold text-sm shadow-lg backdrop-blur-sm animate-xp-rise ${
            e.source === "ai" ? "bg-amber-400/90 text-amber-950" :
            e.source === "level" ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-950" :
            e.source === "combo" ? "bg-fuchsia-500/90 text-white" :
            e.source === "submit" ? "bg-emerald-500/90 text-white" :
            "bg-emerald-500/90 text-white"
          }`}
        >
          {e.label || `+${e.amount} XP`}
        </div>
      ))}
    </div>
  );
}
