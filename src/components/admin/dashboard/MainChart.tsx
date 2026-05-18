import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface Props {
  data?: Array<{ date: string; label: string; visitas: number; cliques: number; leads: number }>;
}

function TerminalTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-[#22c55e]/40 bg-black/95 backdrop-blur px-3 py-2 font-mono text-[11px] shadow-[0_0_30px_rgba(34,197,94,0.15)]">
      <div className="text-zinc-500 mb-1 tracking-wider">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 tabular-nums">
          <span className="flex items-center gap-2" style={{ color: p.color }}>
            <span className="w-2 h-px" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-bold" style={{ color: p.color }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function MainChart({ data = [] }: Props) {

  return (
    <section className="border border-[#1a2e1a] bg-[#0a0f0a] overflow-hidden">
      <header className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-[#1a2e1a]">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-500 tracking-widest">CHART_01</span>
          <h3 className="font-mono text-xs font-bold tracking-wider text-zinc-200">EVOLUÇÃO DIÁRIA</h3>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] tracking-widest text-zinc-500">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 bg-[#22c55e]" />VISITAS</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 bg-[#fbbf24]" />CLIQUES</span>
          <span className="hidden sm:inline-flex items-center gap-1.5"><span className="w-2 h-2 bg-[#38bdf8]" />LEADS</span>
        </div>
      </header>
      <div className="p-2 pt-4">
        <ResponsiveContainer width="100%" height={360}>
          <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gL" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1a2e1a" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#3f3f46"
              fontSize={10}
              tick={{ fill: "#737373", fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "#1a2e1a" }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              stroke="#3f3f46"
              fontSize={10}
              tick={{ fill: "#737373", fontFamily: "JetBrains Mono" }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip content={<TerminalTooltip />} cursor={{ stroke: "#22c55e", strokeDasharray: "2 4", strokeWidth: 1 }} />
            <Area type="monotone" dataKey="visitas" name="Visitas" stroke="#22c55e" strokeWidth={1.5} fill="url(#gV)" />
            <Area type="monotone" dataKey="cliques" name="Cliques" stroke="#fbbf24" strokeWidth={1.5} fill="url(#gC)" />
            <Area type="monotone" dataKey="leads" name="Leads" stroke="#38bdf8" strokeWidth={1.5} fill="url(#gL)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
