import { friendlyClickLabel } from "@/hooks/useAnalytics";

interface Click {
  target: string;
  page: string;
  device: string;
  source: string;
  created_at: string;
}

interface Props {
  clicks?: Click[];
}

function fmt(ts: string) {
  const d = new Date(ts);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

export function RecentClicks({ clicks = [] }: Props) {
  return (
    <section className="border border-[#1a2e1a] bg-[#0a0f0a] overflow-hidden h-full flex flex-col">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#1a2e1a]">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-500 tracking-widest">FEED_03</span>
          <h3 className="font-mono text-xs font-bold tracking-wider text-zinc-200">ÚLTIMOS CLIQUES</h3>
        </div>
        <span className="font-mono text-[10px] text-zinc-500">{clicks.length} eventos</span>
      </header>
      {clicks.length === 0 ? (
        <div className="p-8 text-center font-mono text-xs text-zinc-600 flex-1 flex items-center justify-center">
          — sem cliques recentes —
        </div>
      ) : (
        <ol className="flex-1 max-h-[440px] overflow-y-auto">
          {clicks.map((c, i) => {
            const accent = c.target.includes("whatsapp")
              ? "#22c55e"
              : c.target.includes("cadastro")
              ? "#fbbf24"
              : "#737373";
            return (
              <li
                key={i}
                className="grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-2 border-b border-[#1a2e1a]/60 hover:bg-black/40 font-mono text-[11px]"
              >
                <span className="text-zinc-600 tabular-nums w-10">{fmt(c.created_at).padStart(4, " ")}</span>
                <div className="min-w-0 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />
                  <span className="text-zinc-200 truncate">{friendlyClickLabel(c.target)}</span>
                </div>
                <span className="text-zinc-600 uppercase text-[9px] tracking-widest">
                  {c.device} · {c.source}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
