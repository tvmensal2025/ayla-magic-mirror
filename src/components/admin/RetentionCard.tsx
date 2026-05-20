import { AlertTriangle, Gift } from "lucide-react";

interface Customer {
  id: string;
  name?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const daysSince = (iso?: string | null) => {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
};

export function RetentionCard({ customers }: { customers: Customer[] | undefined }) {
  const list = customers ?? [];

  // Pendentes/devolutiva há mais de 30 dias = risco
  const churnRisk = list
    .filter((c) => {
      const s = (c.status || "").toLowerCase();
      const stale = s === "pending" || s === "devolutiva" || s === "lead" || s === "data_complete";
      return stale && daysSince(c.created_at) >= 30;
    })
    .sort((a, b) => daysSince(b.created_at) - daysSince(a.created_at))
    .slice(0, 8);

  // Aniversariantes de cadastro da semana (multiplo de 7 dias completados)
  const cadastroAnniv = list
    .filter((c) => {
      const d = daysSince(c.created_at);
      return d > 0 && d % 30 === 0 && d <= 365;
    })
    .slice(0, 5);

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Risco churn */}
      <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur overflow-hidden">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <div>
            <h3 className="font-heading font-black text-sm tracking-tight">RISCO DE CHURN</h3>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Parados há +30 dias — bom momento pra reativar</p>
          </div>
        </header>
        {churnRisk.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Nenhum cliente em risco. 🎉</p>
        ) : (
          <ol className="divide-y divide-border/40">
            {churnRisk.map((c) => (
              <li key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-2.5 hover:bg-muted/30">
                <p className="text-sm font-semibold text-foreground truncate">{c.name || "Sem nome"}</p>
                <span className="text-xs tabular-nums text-destructive font-bold">
                  {daysSince(c.created_at)}d
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Aniversariantes de cadastro */}
      <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur overflow-hidden">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
          <Gift className="w-4 h-4 text-accent" />
          <div>
            <h3 className="font-heading font-black text-sm tracking-tight">ANIVERSÁRIO DE CADASTRO</h3>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Bom momento pra parabenizar e pedir indicação</p>
          </div>
        </header>
        {cadastroAnniv.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Ninguém completando ciclo este mês.</p>
        ) : (
          <ol className="divide-y divide-border/40">
            {cadastroAnniv.map((c) => {
              const d = daysSince(c.created_at);
              const months = Math.round(d / 30);
              return (
                <li key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-2.5 hover:bg-muted/30">
                  <p className="text-sm font-semibold text-foreground truncate">{c.name || "Sem nome"}</p>
                  <span className="text-xs tabular-nums text-accent font-bold">
                    {months} {months === 1 ? "mês" : "meses"}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
