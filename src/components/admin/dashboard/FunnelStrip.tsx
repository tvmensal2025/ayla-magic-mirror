import { ChevronRight } from "lucide-react";

interface Props {
  funnel?: Array<{ stage: string; count: number; pct: number }>;
}

const ACCENTS = ["#22c55e", "#fbbf24", "#38bdf8", "#22c55e"];

export function FunnelStrip({ funnel = [] }: Props) {
  if (!funnel.length) return null;
  return (
    <section className="border border-[#1a2e1a] bg-[#0a0f0a] overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#1a2e1a]">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-500 tracking-widest">FNL_04</span>
          <h3 className="font-mono text-xs font-bold tracking-wider text-zinc-200">FUNIL DE CONVERSÃO</h3>
        </div>
        <span className="font-mono text-[10px] text-zinc-500 hidden sm:inline">VISITA → CLIQUE → LEAD → APROVADO</span>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-[#1a2e1a]">
        {funnel.map((s, i) => {
          const prev = i > 0 ? funnel[i - 1].count : null;
          const conv = prev != null ? (prev > 0 ? (s.count / prev) * 100 : 0) : null;
          const accent = ACCENTS[i] || "#22c55e";
          return (
            <div key={s.stage} className="px-4 py-4 relative">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  {String(i + 1).padStart(2, "0")} · {s.stage}
                </span>
                {conv != null && (
                  <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                    <ChevronRight className="inline w-3 h-3" />
                    {conv.toFixed(1)}%
                  </span>
                )}
              </div>
              <p
                className="font-mono font-bold tabular-nums leading-none"
                style={{ color: accent, fontSize: "clamp(1.5rem, 3vw, 2.25rem)" }}
              >
                {String(s.count).padStart(2, "0")}
              </p>
              <div className="mt-3 h-[2px] bg-[#1a2e1a]">
                <div className="h-full transition-all duration-700" style={{ width: `${Math.min(100, s.pct)}%`, background: accent }} />
              </div>
              <p className="mt-1.5 font-mono text-[10px] text-zinc-600 tabular-nums">{s.pct.toFixed(1)}% do topo</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
