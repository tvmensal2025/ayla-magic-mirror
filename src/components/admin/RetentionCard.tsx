import { AlertTriangle, Cake, PartyPopper } from "lucide-react";

interface Customer {
  id: string;
  name?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  data_nascimento?: string | null;
}

const daysSince = (iso?: string | null) => {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
};

// data_nascimento é text "YYYY-MM-DD"
function parseBirth(s?: string | null): { year: number; month: number; day: number } | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const year = Number(m[1]); const month = Number(m[2]); const day = Number(m[3]);
  if (!month || !day || month > 12 || day > 31) return null;
  return { year, month, day };
}

function ageThisYear(year: number): number {
  return new Date().getFullYear() - year;
}

export function RetentionCard({ customers }: { customers: Customer[] | undefined }) {
  const list = customers ?? [];
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curDay = now.getDate();

  // Parados há +30 dias
  const parados = list
    .filter((c) => {
      const s = (c.status || "").toLowerCase();
      const stale = s === "pending" || s === "devolutiva" || s === "lead" || s === "data_complete";
      return stale && daysSince(c.created_at) >= 30;
    })
    .sort((a, b) => daysSince(b.created_at) - daysSince(a.created_at))
    .slice(0, 8);

  // Aniversariantes
  const withBirth = list
    .map((c) => ({ c, b: parseBirth(c.data_nascimento) }))
    .filter((x): x is { c: Customer; b: { year: number; month: number; day: number } } => x.b !== null);

  const aniversariantesHoje = withBirth
    .filter((x) => x.b.month === curMonth && x.b.day === curDay)
    .sort((a, b) => (a.c.name || "").localeCompare(b.c.name || ""));

  const aniversariantesMes = withBirth
    .filter((x) => x.b.month === curMonth)
    .sort((a, b) => a.b.day - b.b.day)
    .slice(0, 12);

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Reativar parados */}
      <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur overflow-hidden">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <div>
            <h3 className="font-heading font-black text-sm tracking-tight">REATIVAR CLIENTES PARADOS</h3>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Sem avanço há +30 dias — mande um oi</p>
          </div>
        </header>
        {parados.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Nenhum cliente parado. 🎉</p>
        ) : (
          <ol className="divide-y divide-border/40">
            {parados.map((c) => (
              <li key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-2.5 hover:bg-muted/30">
                <p className="text-sm font-semibold text-foreground truncate">{c.name || "Sem nome"}</p>
                <span className="text-xs tabular-nums text-destructive font-bold">{daysSince(c.created_at)}d</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Aniversariantes */}
      <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur overflow-hidden">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
          <Cake className="w-4 h-4 text-accent" />
          <div>
            <h3 className="font-heading font-black text-sm tracking-tight">ANIVERSARIANTES</h3>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Hoje e do mês — bom momento pra parabenizar</p>
          </div>
        </header>

        {withBirth.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Nenhuma data de nascimento cadastrada.</p>
        ) : (
          <div className="divide-y divide-border/40">
            {/* Hoje */}
            <div className="px-5 py-3">
              <div className="flex items-center gap-2 mb-2">
                <PartyPopper className="w-3.5 h-3.5 text-accent" />
                <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-bold">Hoje ({aniversariantesHoje.length})</span>
              </div>
              {aniversariantesHoje.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ninguém faz aniversário hoje.</p>
              ) : (
                <ul className="space-y-1">
                  {aniversariantesHoje.map(({ c, b }) => (
                    <li key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-0.5">
                      <p className="text-sm font-semibold text-foreground truncate">{c.name || "Sem nome"}</p>
                      <span className="text-xs tabular-nums text-accent font-bold">{ageThisYear(b.year)} anos</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Mês */}
            <div className="px-5 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Cake className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-bold">
                  Este mês ({aniversariantesMes.length})
                </span>
              </div>
              {aniversariantesMes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ninguém este mês.</p>
              ) : (
                <ul className="space-y-1">
                  {aniversariantesMes.map(({ c, b }) => (
                    <li key={c.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-0.5">
                      <p className="text-sm font-semibold text-foreground truncate">{c.name || "Sem nome"}</p>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {String(b.day).padStart(2, "0")}/{String(b.month).padStart(2, "0")}
                      </span>
                      <span className="text-xs tabular-nums text-accent font-bold w-[60px] text-right">{ageThisYear(b.year)} anos</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
