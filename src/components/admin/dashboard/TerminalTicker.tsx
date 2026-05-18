import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiData {
  current: number;
  previous: number;
  change: number;
  spark?: number[];
}

interface Props {
  kpis?: {
    views: KpiData;
    clicks: KpiData;
    leads: KpiData;
    periodDays?: number;
  };
}

function Arrow({ change }: { change: number }) {
  const flat = Math.abs(change) < 1;
  const up = change >= 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const cls = flat ? "text-zinc-500" : up ? "text-[#22c55e]" : "text-[#ef4444]";
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-xs ${cls}`}>
      <Icon className="w-3 h-3" />
      {flat ? "0.0%" : `${up ? "+" : ""}${change.toFixed(1)}%`}
    </span>
  );
}

function Cell({ label, code, data, accent }: { label: string; code: string; data?: KpiData; accent: string }) {
  return (
    <div className="flex-1 min-w-0 px-4 sm:px-6 py-3 flex items-center gap-4">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-500">{code}</span>
          <span className="font-mono text-[10px] tracking-wider uppercase text-zinc-600 truncate">{label}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span
            className="font-mono font-bold tabular-nums leading-none"
            style={{ color: accent, fontSize: "clamp(1.75rem, 3.2vw, 2.5rem)" }}
          >
            {String(data?.current ?? 0).padStart(2, "0")}
          </span>
          <Arrow change={data?.change ?? 0} />
        </div>
        <span className="font-mono text-[10px] text-zinc-600">PREV {data?.previous ?? 0}</span>
      </div>
    </div>
  );
}

export function TerminalTicker({ kpis }: Props) {
  const period = kpis?.periodDays ?? 30;
  return (
    <section className="border border-[#1a2e1a] bg-[#0a0f0a] overflow-hidden">
      {/* status bar */}
      <div className="flex items-center justify-between gap-4 px-4 py-1.5 border-b border-[#1a2e1a] bg-black">
        <div className="flex items-center gap-3 font-mono text-[10px] tracking-widest text-zinc-500">
          <span className="inline-flex items-center gap-1.5 text-[#22c55e]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
            LIVE
          </span>
          <span className="text-zinc-700">│</span>
          <span>PERIOD <span className="text-[#fbbf24]">{period}D</span></span>
          <span className="text-zinc-700">│</span>
          <span className="hidden sm:inline">LP.PERFORMANCE.TERMINAL v2</span>
        </div>
        <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
          {new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })} BRT
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#1a2e1a]">
        <Cell label="Visitas" code="VWS" data={kpis?.views} accent="#22c55e" />
        <Cell label="Cliques CTA" code="CLK" data={kpis?.clicks} accent="#fbbf24" />
        <Cell label="Novos Leads" code="LDS" data={kpis?.leads} accent="#22c55e" />
      </div>
    </section>
  );
}
