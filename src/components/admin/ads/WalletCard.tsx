import { useEffect, useState } from "react";
import { Wallet, Plus, Loader2, AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  getWalletBalance,
  getWalletFeed,
  createTopupSession,
  type WalletBalance,
  type WalletFeed,
} from "@/services/facebookAds";

const QUICK_AMOUNTS = [50_00, 100_00, 200_00, 500_00];
const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

function formatDateLabel(date: string) {
  const d = new Date(date + "T12:00:00");
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function WalletCard({ consultantId }: { consultantId: string }) {
  const { toast } = useToast();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [feed, setFeed] = useState<WalletFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [topping, setTopping] = useState<number | null>(null);
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    try {
      const [b, f] = await Promise.all([
        getWalletBalance(consultantId),
        getWalletFeed(consultantId, 100),
      ]);
      setBalance(b); setFeed(f);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [consultantId]);

  async function handleTopup(cents: number) {
    setTopping(cents);
    try {
      const { url } = await createTopupSession(cents);
      window.location.href = url;
    } catch (e: any) {
      toast({ title: "Não foi possível iniciar a recarga", description: e?.message || "Tente novamente.", variant: "destructive" });
      setTopping(null);
    }
  }

  const low = balance && balance.balance_cents <= balance.auto_pause_at_cents;
  const inDebt = balance && balance.debt_cents > 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-bold text-foreground">Sua carteira de anúncios</h3>
            <p className="text-xs text-muted-foreground">Pré-pago. Cada gasto reportado pelo Facebook é debitado aqui.</p>
          </div>
        </div>
      </header>

      {loading || !balance ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Saldo disponível</p>
            <p className="text-3xl font-bold text-foreground mt-1">{fmt(balance.balance_cents)}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span>Total recarregado: <strong className="text-foreground">{fmt(balance.total_topped_up_cents)}</strong></span>
              <span>Total gasto: <strong className="text-foreground">{fmt(balance.total_spent_cents)}</strong></span>
            </div>
            {inDebt && (
              <div className="mt-3 flex items-start gap-2 text-xs text-destructive rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div>
                  <strong>Em débito: {fmt(balance.debt_cents)}</strong> — A plataforma adiantou esse valor para o Meta. Recarregue para regularizar e reativar suas campanhas.
                </div>
              </div>
            )}
            {!inDebt && low && (
              <div className="mt-3 flex items-center gap-2 text-xs text-warning rounded-md bg-warning/10 px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Saldo abaixo de {fmt(balance.auto_pause_at_cents)} — campanhas serão pausadas automaticamente.
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Recarga rápida</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_AMOUNTS.map((c) => (
                <Button
                  key={c}
                  variant="outline"
                  className="h-12 text-sm font-semibold"
                  disabled={topping !== null}
                  onClick={() => handleTopup(c)}
                >
                  {topping === c ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-3.5 h-3.5 mr-1" /> {fmt(c)}</>}
                </Button>
              ))}
            </div>
          </div>

          {feed && (feed.groups.length > 0 || feed.others.length > 0) && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Últimas movimentações</p>
              <ul className="space-y-1.5">
                {feed.groups.map((g) => {
                  const open = !!openKeys[g.key];
                  return (
                    <li key={g.key} className="rounded-lg border border-border/40 bg-background/40 overflow-hidden">
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/30 transition"
                        onClick={() => setOpenKeys((p) => ({ ...p, [g.key]: !p[g.key] }))}
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <ChevronDown className={`w-4 h-4 mt-0.5 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">
                              {formatDateLabel(g.date)} · {g.campaign_name}
                              {g.distribuidora && <span className="text-muted-foreground font-normal"> · {g.distribuidora}</span>}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {g.leads > 0
                                ? <><strong className="text-foreground">{g.leads}</strong> conversa{g.leads === 1 ? "" : "s"} no zap · {g.impressions.toLocaleString("pt-BR")} pessoas viram · {g.clicks} tocaram · custo por conversa <strong className="text-foreground">{fmt(g.cpl_cents)}</strong></>
                                : g.clicks > 0
                                  ? <>{g.impressions.toLocaleString("pt-BR")} pessoas viram · {g.clicks} tocaram · ninguém começou conversa ainda</>
                                  : <>{g.impressions.toLocaleString("pt-BR")} pessoas viram · ninguém tocou ainda</>}
                            </div>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-destructive whitespace-nowrap">−{fmt(g.total_amount_cents)}</span>
                      </button>
                      {open && (
                        <ul className="border-t border-border/40 bg-muted/20 divide-y divide-border/30">
                          {g.items.map((it) => {
                            const dImp = Number(it.metadata?.delta_impressions ?? 0);
                            const dCl = Number(it.metadata?.delta_clicks ?? 0);
                            const dLd = Number(it.metadata?.delta_leads ?? 0);
                            const gross = Number(it.gross_spend_cents ?? it.metadata?.gross_meta_cents ?? 0);
                            return (
                              <li key={it.id} className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
                                <div className="text-muted-foreground min-w-0">
                                  <span className="text-foreground/80">{formatTime(it.created_at)}</span>
                                  {gross > 0 && <span className="ml-2">Meta {fmt(gross)}</span>}
                                  {(dImp + dCl + dLd > 0) && (
                                    <span className="ml-2">
                                      • {dImp > 0 ? `${dImp} impr.` : ""}{dCl > 0 ? ` ${dCl} clique${dCl > 1 ? "s" : ""}` : ""}{dLd > 0 ? ` ${dLd} lead${dLd > 1 ? "s" : ""}` : ""}
                                    </span>
                                  )}
                                </div>
                                <span className="text-destructive whitespace-nowrap">−{fmt(it.amount_cents)}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
                {feed.others.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/40 bg-background/40 text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground min-w-0">
                      <ArrowUpRight className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate">{t.description || (t.type === "topup" ? "Recarga" : t.type)}</span>
                    </span>
                    <span className={t.type === "refund" ? "text-warning" : "text-primary"}>+{fmt(t.amount_cents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
